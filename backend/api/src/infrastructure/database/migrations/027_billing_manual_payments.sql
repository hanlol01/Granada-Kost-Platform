-- KMO-W06 canonical contract billing, manual-payment, receipt, and reversal authority.
-- Additive and replay-safe; legacy rows remain readable while legacy payment states are normalized.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_installments') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL
     OR to_regclass('public.business_events') IS NULL
     OR to_regclass('public.payment_proofs') IS NULL
     OR to_regclass('public.lease_deposit_transactions') IS NULL THEN
    RAISE EXCEPTION 'W06_PREREQUISITE_W05_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END $$;

ALTER TABLE invoices
  ALTER COLUMN occupancy_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES lease_installments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invoice_purpose TEXT,
  ADD COLUMN IF NOT EXISTS other_charge_type TEXT,
  ADD COLUMN IF NOT EXISTS other_charge_description TEXT,
  ADD COLUMN IF NOT EXISTS authority_source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS snapshot_building_code TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_category_name TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_contract_rent_amount BIGINT,
  ADD COLUMN IF NOT EXISTS snapshot_payment_plan_type TEXT,
  ADD COLUMN IF NOT EXISTS credit_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS command_fingerprint TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_purpose_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_purpose_check CHECK (
      invoice_purpose IS NULL OR invoice_purpose IN ('rent','other_charge')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_other_charge_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_other_charge_check CHECK (
      (invoice_purpose <> 'other_charge')
      OR (
        other_charge_type IN ('documented_damage','utilities','parking','lost_key_or_access_card','approved_administration','other')
        AND char_length(trim(COALESCE(other_charge_description,''))) BETWEEN 3 AND 500
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_authority_source_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_authority_source_check CHECK (
      authority_source IN ('legacy','contract_schedule','other_charge')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_snapshot_amount_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_snapshot_amount_check CHECK (
      (snapshot_contract_rent_amount IS NULL OR snapshot_contract_rent_amount >= 0)
      AND credit_amount >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_payment_plan_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_payment_plan_check CHECK (
      snapshot_payment_plan_type IS NULL
      OR snapshot_payment_plan_type IN ('annual_full','two_month_installments')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_w06_schedule_snapshot_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_w06_schedule_snapshot_check CHECK (
      authority_source <> 'contract_schedule'
      OR (
        installment_id IS NOT NULL AND invoice_purpose='rent' AND lease_id IS NOT NULL
        AND snapshot_building_code IS NOT NULL AND snapshot_category_name IS NOT NULL
        AND snapshot_contract_rent_amount IS NOT NULL AND snapshot_payment_plan_type IS NOT NULL
      )
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_w06_installment
  ON invoices(installment_id) WHERE installment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_w06_current_worklist
  ON invoices(property_id,due_date,invoice_status)
  WHERE invoice_status IN ('issued','partially_paid','overdue');
CREATE INDEX IF NOT EXISTS idx_invoices_w06_resident_lease
  ON invoices(property_id,resident_id,lease_id,due_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_w06_command_fingerprint
  ON invoices(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_purpose TEXT,
  ADD COLUMN IF NOT EXISTS proof_id UUID REFERENCES payment_proofs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS authority_source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS command_fingerprint TEXT;

UPDATE payments
SET payment_status = CASE payment_status
  WHEN 'pending' THEN 'pending_confirmation'
  WHEN 'void' THEN 'rejected'
  ELSE payment_status
END
WHERE payment_status IN ('pending','void');

ALTER TABLE payments
  ALTER COLUMN payment_status SET DEFAULT 'pending_confirmation';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname='payments_status_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%pending_confirmation%'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_status_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_status_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (
      payment_status IN ('pending_confirmation','verified','rejected','reversed')
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_w06_purpose_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_w06_purpose_check CHECK (
      payment_purpose IS NULL OR payment_purpose IN ('rent','dp','security_deposit','other_charge')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_w06_authority_source_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_w06_authority_source_check CHECK (
      authority_source IN ('legacy','manual_transfer','audited_cash')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_w06_method_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_w06_method_check CHECK (
      authority_source='legacy' OR payment_method IN ('bank_transfer','cash')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_w06_scope_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_w06_scope_check CHECK (
      authority_source='legacy'
      OR (resident_id IS NOT NULL AND lease_id IS NOT NULL AND payment_purpose IS NOT NULL)
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_w06_proof
  ON payments(proof_id) WHERE proof_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_w06_lease_purpose
  ON payments(property_id,lease_id,payment_purpose,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_w06_command_fingerprint
  ON payments(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL;

ALTER TABLE payment_proofs
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_purpose TEXT NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS command_fingerprint TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_proofs_w06_method_check') THEN
    ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_w06_method_check CHECK (
      payment_method='bank_transfer'
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_proofs_w06_purpose_check') THEN
    ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_w06_purpose_check CHECK (
      payment_purpose IN ('rent','dp','security_deposit','other_charge')
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_proofs_w06_command_fingerprint
  ON payment_proofs(property_id,command_fingerprint) WHERE command_fingerprint IS NOT NULL;

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS allocation_purpose TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_allocations_w06_purpose_check') THEN
    ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_w06_purpose_check CHECK (
      allocation_purpose IS NULL OR allocation_purpose IN ('rent','dp','other_charge')
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_allocation_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  intended_amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocation_intents_target_unique UNIQUE(payment_id,invoice_id),
  CONSTRAINT payment_allocation_intents_amount_check CHECK (intended_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocation_intents_payment
  ON payment_allocation_intents(payment_id,invoice_id);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  receipt_code TEXT NOT NULL,
  receipt_kind TEXT NOT NULL,
  amount BIGINT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  safe_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_code_unique UNIQUE(property_id,receipt_code),
  CONSTRAINT payment_receipts_kind_check CHECK (receipt_kind IN ('payment','reversal')),
  CONSTRAINT payment_receipts_amount_check CHECK (amount > 0),
  CONSTRAINT payment_receipts_snapshot_check CHECK (jsonb_typeof(safe_snapshot)='object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_payment
  ON payment_receipts(payment_id) WHERE payment_id IS NOT NULL AND receipt_kind='payment';
CREATE INDEX IF NOT EXISTS idx_payment_receipts_property_issued
  ON payment_receipts(property_id,issued_at DESC);

CREATE TABLE IF NOT EXISTS payment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  reversed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reversed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_id UUID REFERENCES payment_receipts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_reversals_payment_unique UNIQUE(payment_id),
  CONSTRAINT payment_reversals_reason_check CHECK (char_length(trim(reason)) BETWEEN 10 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_payment_reversals_property_time
  ON payment_reversals(property_id,reversed_at DESC);

CREATE TABLE IF NOT EXISTS payment_reversal_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  reversal_id UUID NOT NULL REFERENCES payment_reversals(id) ON DELETE RESTRICT,
  original_allocation_id UUID NOT NULL REFERENCES payment_allocations(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  reversed_amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_reversal_allocations_original_unique UNIQUE(original_allocation_id),
  CONSTRAINT payment_reversal_allocations_amount_check CHECK (reversed_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_reversal_allocations_invoice
  ON payment_reversal_allocations(invoice_id,created_at);

CREATE TABLE IF NOT EXISTS payment_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_evidence_files_unique UNIQUE(payment_id,file_id),
  CONSTRAINT payment_evidence_files_kind_check CHECK (evidence_kind IN ('transfer_proof','cash_evidence'))
);

CREATE INDEX IF NOT EXISTS idx_payment_evidence_files_payment
  ON payment_evidence_files(payment_id,created_at);

CREATE TABLE IF NOT EXISTS invoice_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_evidence_files_unique UNIQUE(invoice_id,file_id),
  CONSTRAINT invoice_evidence_files_kind_check CHECK (evidence_kind IN ('damage_evidence','other_charge_evidence'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_evidence_files_invoice
  ON invoice_evidence_files(invoice_id,created_at);

ALTER TABLE lease_deposit_transactions
  ADD COLUMN IF NOT EXISTS evidence_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_id UUID REFERENCES payment_reversals(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lease_deposit_transactions_w06_evidence_check') THEN
    ALTER TABLE lease_deposit_transactions
      ADD CONSTRAINT lease_deposit_transactions_w06_evidence_check CHECK (
        transaction_type <> 'deduction' OR evidence_file_id IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_deposit_transactions_reversal
  ON lease_deposit_transactions(reversal_id) WHERE reversal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_w06_contract_invoice()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  scheduled lease_installments%ROWTYPE;
BEGIN
  IF NEW.authority_source <> 'contract_schedule' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO scheduled FROM lease_installments WHERE id=NEW.installment_id;
  IF NOT FOUND
     OR scheduled.property_id <> NEW.property_id
     OR scheduled.lease_id <> NEW.lease_id
     OR scheduled.coverage_start_date <> NEW.cycle_start_date
     OR scheduled.coverage_end_date <> NEW.cycle_end_date
     OR scheduled.due_date <> NEW.due_date
     OR scheduled.scheduled_amount <> NEW.total_amount THEN
    RAISE EXCEPTION 'W06_CONTRACT_INVOICE_SCHEDULE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_contract_invoice_scope ON invoices;
CREATE TRIGGER trg_w06_contract_invoice_scope
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION validate_w06_contract_invoice();

CREATE OR REPLACE FUNCTION validate_w06_allocation_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payment_scope RECORD;
  invoice_scope RECORD;
BEGIN
  SELECT property_id,lease_id,payment_purpose INTO payment_scope FROM payments WHERE id=NEW.payment_id;
  SELECT property_id,lease_id,invoice_purpose INTO invoice_scope FROM invoices WHERE id=NEW.invoice_id;
  IF payment_scope.property_id IS NULL OR invoice_scope.property_id IS NULL
     OR payment_scope.property_id <> NEW.property_id
     OR invoice_scope.property_id <> NEW.property_id
     OR payment_scope.lease_id <> NEW.lease_id
     OR invoice_scope.lease_id <> NEW.lease_id
     OR payment_scope.payment_purpose='security_deposit'
     OR (payment_scope.payment_purpose='other_charge') <> (invoice_scope.invoice_purpose='other_charge') THEN
    RAISE EXCEPTION 'W06_ALLOCATION_INTENT_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_allocation_intent_scope ON payment_allocation_intents;
CREATE TRIGGER trg_w06_allocation_intent_scope
  BEFORE INSERT ON payment_allocation_intents
  FOR EACH ROW EXECUTE FUNCTION validate_w06_allocation_intent();

CREATE OR REPLACE FUNCTION validate_w06_payment_allocation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  payment_scope RECORD;
  invoice_scope RECORD;
BEGIN
  SELECT property_id,lease_id,payment_status,payment_purpose INTO payment_scope FROM payments WHERE id=NEW.payment_id;
  SELECT property_id,lease_id,invoice_purpose INTO invoice_scope FROM invoices WHERE id=NEW.invoice_id;
  IF payment_scope.property_id IS NULL OR invoice_scope.property_id IS NULL
     OR payment_scope.property_id <> invoice_scope.property_id
     OR payment_scope.lease_id <> NEW.lease_id
     OR invoice_scope.lease_id <> NEW.lease_id
     OR payment_scope.payment_status <> 'verified'
     OR payment_scope.payment_purpose='security_deposit'
     OR NEW.allocation_purpose IS DISTINCT FROM payment_scope.payment_purpose
     OR (payment_scope.payment_purpose='other_charge') <> (invoice_scope.invoice_purpose='other_charge') THEN
    RAISE EXCEPTION 'W06_PAYMENT_ALLOCATION_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_payment_allocation_scope ON payment_allocations;
CREATE TRIGGER trg_w06_payment_allocation_scope
  BEFORE INSERT ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_w06_payment_allocation();

CREATE OR REPLACE FUNCTION validate_w06_reversal_allocation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original_scope RECORD;
  reversal_scope RECORD;
BEGIN
  SELECT property_id,payment_id INTO reversal_scope FROM payment_reversals WHERE id=NEW.reversal_id;
  SELECT pa.payment_id,pa.invoice_id,pa.allocated_amount,i.property_id
    INTO original_scope
    FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id
   WHERE pa.id=NEW.original_allocation_id;
  IF reversal_scope.property_id IS NULL OR original_scope.property_id IS NULL
     OR reversal_scope.property_id <> NEW.property_id
     OR original_scope.property_id <> NEW.property_id
     OR reversal_scope.payment_id <> original_scope.payment_id
     OR original_scope.invoice_id <> NEW.invoice_id
     OR original_scope.allocated_amount <> NEW.reversed_amount THEN
    RAISE EXCEPTION 'W06_REVERSAL_ALLOCATION_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_reversal_allocation_scope ON payment_reversal_allocations;
CREATE TRIGGER trg_w06_reversal_allocation_scope
  BEFORE INSERT ON payment_reversal_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_w06_reversal_allocation();

CREATE OR REPLACE FUNCTION validate_w06_deposit_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_balance BIGINT;
BEGIN
  IF NEW.direction <> 'debit' THEN RETURN NEW; END IF;
  PERFORM id FROM leases WHERE id=NEW.lease_id FOR UPDATE;
  SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0)
    INTO current_balance FROM lease_deposit_transactions WHERE lease_id=NEW.lease_id;
  IF current_balance < NEW.amount THEN
    RAISE EXCEPTION 'W06_DEPOSIT_NEGATIVE_BALANCE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_deposit_non_negative ON lease_deposit_transactions;
CREATE TRIGGER trg_w06_deposit_non_negative
  BEFORE INSERT ON lease_deposit_transactions
  FOR EACH ROW EXECUTE FUNCTION validate_w06_deposit_balance();

CREATE OR REPLACE FUNCTION prevent_w06_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'W06_LEDGER_APPEND_ONLY' USING ERRCODE='check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_payment_allocations_append_only ON payment_allocations;
CREATE TRIGGER trg_w06_payment_allocations_append_only
  BEFORE UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_payment_intents_append_only ON payment_allocation_intents;
CREATE TRIGGER trg_w06_payment_intents_append_only
  BEFORE UPDATE OR DELETE ON payment_allocation_intents
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_receipts_append_only ON payment_receipts;
CREATE TRIGGER trg_w06_receipts_append_only
  BEFORE UPDATE OR DELETE ON payment_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_reversals_append_only ON payment_reversals;
CREATE TRIGGER trg_w06_reversals_append_only
  BEFORE UPDATE OR DELETE ON payment_reversals
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_reversal_allocations_append_only ON payment_reversal_allocations;
CREATE TRIGGER trg_w06_reversal_allocations_append_only
  BEFORE UPDATE OR DELETE ON payment_reversal_allocations
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_payment_evidence_append_only ON payment_evidence_files;
CREATE TRIGGER trg_w06_payment_evidence_append_only
  BEFORE UPDATE OR DELETE ON payment_evidence_files
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

DROP TRIGGER IF EXISTS trg_w06_invoice_evidence_append_only ON invoice_evidence_files;
CREATE TRIGGER trg_w06_invoice_evidence_append_only
  BEFORE UPDATE OR DELETE ON invoice_evidence_files
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

CREATE OR REPLACE FUNCTION protect_w06_verified_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.payment_status='verified' THEN
    RAISE EXCEPTION 'W06_VERIFIED_PAYMENT_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_verified_payment_immutable ON payments;
CREATE TRIGGER trg_w06_verified_payment_immutable
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION protect_w06_verified_payment();

CREATE OR REPLACE FUNCTION protect_w06_reviewed_proof()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.proof_status <> 'pending_review' THEN
    RAISE EXCEPTION 'W06_REVIEWED_PROOF_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_reviewed_proof_immutable ON payment_proofs;
CREATE TRIGGER trg_w06_reviewed_proof_immutable
  BEFORE UPDATE OR DELETE ON payment_proofs
  FOR EACH ROW EXECUTE FUNCTION protect_w06_reviewed_proof();

CREATE OR REPLACE FUNCTION protect_w06_invoice_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'W06_INVOICE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  IF OLD.invoice_status <> 'draft' AND (
    NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.resident_id IS DISTINCT FROM OLD.resident_id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
    OR NEW.installment_id IS DISTINCT FROM OLD.installment_id
    OR NEW.invoice_purpose IS DISTINCT FROM OLD.invoice_purpose
    OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.credit_amount IS DISTINCT FROM OLD.credit_amount
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.cycle_start_date IS DISTINCT FROM OLD.cycle_start_date
    OR NEW.cycle_end_date IS DISTINCT FROM OLD.cycle_end_date
    OR NEW.snapshot_room_number IS DISTINCT FROM OLD.snapshot_room_number
    OR NEW.snapshot_resident_name IS DISTINCT FROM OLD.snapshot_resident_name
    OR NEW.snapshot_contract_rent_amount IS DISTINCT FROM OLD.snapshot_contract_rent_amount
  ) THEN
    RAISE EXCEPTION 'W06_ISSUED_INVOICE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_invoice_authority ON invoices;
CREATE TRIGGER trg_w06_invoice_authority
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION protect_w06_invoice_authority();

CREATE OR REPLACE FUNCTION protect_w06_installment_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE'
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
     OR NEW.coverage_start_date IS DISTINCT FROM OLD.coverage_start_date
     OR NEW.coverage_end_date IS DISTINCT FROM OLD.coverage_end_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.scheduled_amount IS DISTINCT FROM OLD.scheduled_amount THEN
    RAISE EXCEPTION 'W06_INSTALLMENT_AUTHORITY_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_installment_authority ON lease_installments;
CREATE TRIGGER trg_w06_installment_authority
  BEFORE UPDATE OR DELETE ON lease_installments
  FOR EACH ROW EXECUTE FUNCTION protect_w06_installment_authority();

CREATE OR REPLACE FUNCTION prevent_lease_deposit_financial_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEASE_DEPOSIT_LEDGER_APPEND_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.transfer_record_id IS DISTINCT FROM OLD.transfer_record_id
     OR NEW.reason_type IS DISTINCT FROM OLD.reason_type
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.evidence_file_id IS DISTINCT FROM OLD.evidence_file_id
     OR NEW.reversal_id IS DISTINCT FROM OLD.reversal_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'LEASE_DEPOSIT_LEDGER_APPEND_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_w06_invoice_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_status='unpaid' THEN
    RAISE EXCEPTION 'W06_UNPAID_IS_NOT_PERSISTENT' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w06_invoice_status ON invoices;
CREATE TRIGGER trg_w06_invoice_status
  BEFORE INSERT OR UPDATE OF invoice_status ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_w06_invoice_status();

COMMIT;
