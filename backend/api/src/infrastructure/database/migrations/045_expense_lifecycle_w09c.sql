BEGIN;

DO $$
BEGIN
  IF to_regclass('public.properties') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.business_events') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL THEN
    RAISE EXCEPTION 'W09C requires property, audit, outbox, and idempotency authority';
  END IF;
END $$;

-- Expense proofs are private operational evidence, never public media.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_purpose_check') THEN
    ALTER TABLE files DROP CONSTRAINT files_purpose_check;
  END IF;
  ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (
    file_purpose IN (
      'payment_proof', 'complaint_attachment', 'maintenance_attachment',
      'expense_proof', 'vehicle_photo', 'vehicle_document', 'room_photo',
      'property_logo', 'hunian_gallery', 'ktp', 'profile_photo'
    )
  );
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id UUID REFERENCES room_buildings(id) ON DELETE RESTRICT,
  work_order_id UUID REFERENCES maintenance_work_orders(id) ON DELETE RESTRICT,
  proof_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  expense_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  vendor_name TEXT,
  notes TEXT,
  expense_status TEXT NOT NULL DEFAULT 'draft',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reject_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  reversed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_check CHECK (amount > 0),
  CONSTRAINT expenses_method_check CHECK (payment_method IN ('cash', 'bank_transfer', 'qris', 'ewallet', 'other')),
  CONSTRAINT expenses_status_check CHECK (expense_status IN ('draft', 'pending_approval', 'approved', 'paid', 'rejected', 'cancelled', 'reversed', 'archived')),
  CONSTRAINT expenses_category_check CHECK (length(trim(category)) BETWEEN 2 AND 120),
  CONSTRAINT expenses_cancel_reason_check CHECK (expense_status <> 'cancelled' OR length(trim(cancel_reason)) >= 3),
  CONSTRAINT expenses_reject_reason_check CHECK (expense_status <> 'rejected' OR length(trim(reject_reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_expenses_property_date
  ON expenses(property_id, expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_property_status
  ON expenses(property_id, expense_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_work_order
  ON expenses(work_order_id) WHERE work_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS expense_status_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_history_status_check CHECK (to_status IN ('draft', 'pending_approval', 'approved', 'paid', 'rejected', 'cancelled', 'reversed', 'archived'))
);

CREATE TABLE IF NOT EXISTS expense_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL,
  payment_method TEXT NOT NULL,
  reference TEXT,
  paid_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_payment_amount_check CHECK (amount > 0),
  CONSTRAINT expense_payment_method_check CHECK (payment_method IN ('cash', 'bank_transfer', 'qris', 'ewallet', 'other')),
  CONSTRAINT expense_payment_unique_expense UNIQUE (expense_id)
);

CREATE TABLE IF NOT EXISTS expense_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  reversal_amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  reversed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_reversal_amount_check CHECK (reversal_amount > 0),
  CONSTRAINT expense_reversal_reason_check CHECK (length(trim(reason)) >= 3),
  CONSTRAINT expense_reversal_unique_expense UNIQUE (expense_id)
);

CREATE OR REPLACE FUNCTION validate_expense_references()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM room_buildings b WHERE b.id = NEW.building_id AND b.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'EXPENSE_BUILDING_SCOPE_DENIED';
  END IF;
  IF NEW.work_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM maintenance_work_orders w WHERE w.id = NEW.work_order_id AND w.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'EXPENSE_WORK_ORDER_SCOPE_DENIED';
  END IF;
  IF NEW.proof_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM files f WHERE f.id = NEW.proof_file_id AND f.property_id = NEW.property_id
      AND f.file_purpose = 'expense_proof' AND f.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'EXPENSE_PROOF_SCOPE_DENIED';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_expense_original_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EXPENSE_ORIGINAL_APPEND_ONLY';
  END IF;
  IF NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.building_id IS DISTINCT FROM OLD.building_id
     OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
     OR NEW.proof_file_id IS DISTINCT FROM OLD.proof_file_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.vendor_name IS DISTINCT FROM OLD.vendor_name
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'EXPENSE_ORIGINAL_APPEND_ONLY';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expense_original_append_only ON expenses;
CREATE TRIGGER trg_expense_original_append_only
  BEFORE UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_original_mutation();

CREATE OR REPLACE FUNCTION validate_expense_evidence_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id = NEW.expense_id AND e.property_id = NEW.property_id
  ) THEN
    RAISE EXCEPTION 'EXPENSE_EVIDENCE_SCOPE_DENIED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expense_history_scope ON expense_status_histories;
CREATE TRIGGER trg_expense_history_scope
  BEFORE INSERT ON expense_status_histories
  FOR EACH ROW EXECUTE FUNCTION validate_expense_evidence_scope();
DROP TRIGGER IF EXISTS trg_expense_payment_scope ON expense_payments;
CREATE TRIGGER trg_expense_payment_scope
  BEFORE INSERT ON expense_payments
  FOR EACH ROW EXECUTE FUNCTION validate_expense_evidence_scope();
DROP TRIGGER IF EXISTS trg_expense_reversal_scope ON expense_reversals;
CREATE TRIGGER trg_expense_reversal_scope
  BEFORE INSERT ON expense_reversals
  FOR EACH ROW EXECUTE FUNCTION validate_expense_evidence_scope();

DROP TRIGGER IF EXISTS trg_validate_expense_references ON expenses;
CREATE TRIGGER trg_validate_expense_references
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION validate_expense_references();

CREATE OR REPLACE FUNCTION prevent_expense_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EXPENSE_EVIDENCE_APPEND_ONLY';
END $$;

DROP TRIGGER IF EXISTS trg_expense_status_history_append_only ON expense_status_histories;
CREATE TRIGGER trg_expense_status_history_append_only
  BEFORE UPDATE OR DELETE ON expense_status_histories
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_evidence_mutation();
DROP TRIGGER IF EXISTS trg_expense_payment_append_only ON expense_payments;
CREATE TRIGGER trg_expense_payment_append_only
  BEFORE UPDATE OR DELETE ON expense_payments
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_evidence_mutation();
DROP TRIGGER IF EXISTS trg_expense_reversal_append_only ON expense_reversals;
CREATE TRIGGER trg_expense_reversal_append_only
  BEFORE UPDATE OR DELETE ON expense_reversals
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_evidence_mutation();

COMMIT;
