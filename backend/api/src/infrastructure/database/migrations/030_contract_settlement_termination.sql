-- KMO-W07A contract settlement, arrears, extension, and lease-termination authority.
-- This migration is additive. It never rewrites an existing payment, occupancy, or lease history.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.invoices') IS NULL
     OR to_regclass('public.lease_deposit_transactions') IS NULL
     OR to_regclass('public.files') IS NULL THEN
    RAISE EXCEPTION 'W07A_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

-- One immutable contract-rent obligation is attached to each newly onboarded lease.
-- The state is intentionally small; overdue and admin-action states are calculated
-- from the authoritative deadline so stale status rows cannot survive a payment.
CREATE TABLE IF NOT EXISTS lease_contract_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'awaiting_activation',
  activated_at TIMESTAMPTZ,
  original_due_at TIMESTAMPTZ,
  extension_due_at TIMESTAMPTZ,
  extension_reason TEXT,
  extension_granted_at TIMESTAMPTZ,
  extension_granted_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_contract_settlements_lease_unique UNIQUE (lease_id),
  CONSTRAINT lease_contract_settlements_invoice_unique UNIQUE (invoice_id),
  CONSTRAINT lease_contract_settlements_state_check CHECK (
    state IN ('awaiting_activation', 'open', 'termination_pending', 'terminated', 'paid')
  ),
  CONSTRAINT lease_contract_settlements_activation_check CHECK (
    (state = 'awaiting_activation' AND activated_at IS NULL AND original_due_at IS NULL)
    OR (state <> 'awaiting_activation' AND activated_at IS NOT NULL AND original_due_at IS NOT NULL)
  ),
  CONSTRAINT lease_contract_settlements_extension_check CHECK (
    (extension_due_at IS NULL AND extension_reason IS NULL AND extension_granted_at IS NULL AND extension_granted_by_user_id IS NULL)
    OR (
      extension_due_at IS NOT NULL
      AND char_length(trim(extension_reason)) BETWEEN 3 AND 1000
      AND extension_granted_at IS NOT NULL
      AND extension_granted_by_user_id IS NOT NULL
      AND extension_due_at > original_due_at
      AND extension_due_at <= original_due_at + INTERVAL '14 days'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_contract_settlements_property_state
  ON lease_contract_settlements(property_id, state, original_due_at);

CREATE TABLE IF NOT EXISTS lease_termination_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES lease_contract_settlements(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL,
  notes TEXT,
  planned_checkout_date DATE NOT NULL,
  started_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  checkout_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  checked_out_at TIMESTAMPTZ,
  inspection_notes TEXT,
  room_status_after_checkout TEXT,
  outstanding_rent_before_settlement BIGINT,
  deposit_offset_amount BIGINT NOT NULL DEFAULT 0,
  damage_deduction_amount BIGINT NOT NULL DEFAULT 0,
  damage_reason TEXT,
  damage_evidence_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  refund_amount BIGINT NOT NULL DEFAULT 0,
  refund_method TEXT,
  refunded_at TIMESTAMPTZ,
  refund_note TEXT,
  refund_evidence_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_termination_cases_status_check CHECK (status IN ('pending', 'cancelled', 'checked_out')),
  CONSTRAINT lease_termination_cases_reason_check CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  CONSTRAINT lease_termination_cases_amounts_check CHECK (
    deposit_offset_amount >= 0 AND damage_deduction_amount >= 0 AND refund_amount >= 0
  ),
  CONSTRAINT lease_termination_cases_damage_evidence_check CHECK (
    damage_deduction_amount = 0 OR (
      char_length(trim(COALESCE(damage_reason, ''))) BETWEEN 3 AND 1000
      AND damage_evidence_file_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_termination_cases_refund_evidence_check CHECK (
    refund_amount = 0 OR (
      refund_method IN ('cash', 'bank_transfer')
      AND refunded_at IS NOT NULL
      AND refund_evidence_file_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_termination_cases_completion_check CHECK (
    status <> 'checked_out' OR (
      checkout_by_user_id IS NOT NULL
      AND checked_out_at IS NOT NULL
      AND room_status_after_checkout IN ('vacant', 'maintenance')
      AND outstanding_rent_before_settlement IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_termination_cases_pending
  ON lease_termination_cases(lease_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lease_termination_cases_property_status
  ON lease_termination_cases(property_id, status, planned_checkout_date);

-- A deposit deduction is not a rent payment. The explicit offset row is the only
-- authority allowed to raise the otherwise immutable invoice credit amount.
CREATE TABLE IF NOT EXISTS contract_settlement_deposit_offsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES lease_contract_settlements(id) ON DELETE RESTRICT,
  termination_case_id UUID NOT NULL REFERENCES lease_termination_cases(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  deposit_transaction_id UUID NOT NULL REFERENCES lease_deposit_transactions(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  -- The immutable invoice credit immediately before this one termination offset.
  -- It lets the issued-invoice guard permit this exact adjustment once, without
  -- treating earlier DP/Booking Fee credits as part of the deposit offset.
  invoice_credit_before_amount BIGINT NOT NULL CHECK (invoice_credit_before_amount >= 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_settlement_deposit_offsets_deposit_transaction_unique UNIQUE (deposit_transaction_id),
  CONSTRAINT contract_settlement_deposit_offsets_settlement_unique UNIQUE (settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_settlement_deposit_offsets_settlement
  ON contract_settlement_deposit_offsets(settlement_id, created_at);

-- A rent-arrears offset is authorised by the termination case itself, not by a
-- photo of room damage. Other deposit deductions retain W06's evidence rule.
ALTER TABLE lease_deposit_transactions
  DROP CONSTRAINT IF EXISTS lease_deposit_transactions_w06_evidence_check;

ALTER TABLE lease_deposit_transactions
  DROP CONSTRAINT IF EXISTS lease_deposit_transactions_w07_evidence_check;

ALTER TABLE lease_deposit_transactions
  ADD CONSTRAINT lease_deposit_transactions_w07_evidence_check CHECK (
    transaction_type <> 'deduction'
    OR reason_type = 'termination_rent_offset'
    OR evidence_file_id IS NOT NULL
  ) NOT VALID;

CREATE OR REPLACE FUNCTION validate_w07_contract_settlement_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  invoice_property UUID;
  invoice_lease UUID;
  settlement_property UUID;
  settlement_lease UUID;
  settlement_invoice UUID;
BEGIN
  SELECT property_id, lease_id INTO invoice_property, invoice_lease FROM invoices WHERE id = NEW.invoice_id;
  IF invoice_property IS DISTINCT FROM NEW.property_id OR invoice_lease IS DISTINCT FROM NEW.lease_id THEN
    RAISE EXCEPTION 'W07_CONTRACT_SETTLEMENT_INVOICE_SCOPE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'contract_settlement_deposit_offsets' THEN
    SELECT property_id, lease_id, invoice_id
      INTO settlement_property, settlement_lease, settlement_invoice
      FROM lease_contract_settlements WHERE id = NEW.settlement_id;
    IF settlement_property IS DISTINCT FROM NEW.property_id
       OR settlement_lease IS DISTINCT FROM NEW.lease_id
       OR settlement_invoice IS DISTINCT FROM NEW.invoice_id THEN
      RAISE EXCEPTION 'W07_DEPOSIT_OFFSET_SCOPE_INVALID' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_w07_contract_settlement_scope ON lease_contract_settlements;
CREATE TRIGGER trg_w07_contract_settlement_scope
  BEFORE INSERT OR UPDATE ON lease_contract_settlements
  FOR EACH ROW EXECUTE FUNCTION validate_w07_contract_settlement_scope();

DROP TRIGGER IF EXISTS trg_w07_contract_settlement_deposit_offset_scope ON contract_settlement_deposit_offsets;
CREATE TRIGGER trg_w07_contract_settlement_deposit_offset_scope
  BEFORE INSERT OR UPDATE ON contract_settlement_deposit_offsets
  FOR EACH ROW EXECUTE FUNCTION validate_w07_contract_settlement_scope();

-- Replace the W06 guard only to permit an increasing invoice credit that is backed
-- by explicit, immutable deposit-offset evidence. All other issued-invoice fields
-- remain immutable, and a credit can never be reduced or fabricated.
CREATE OR REPLACE FUNCTION protect_w06_invoice_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  backed_offset_amount BIGINT;
  offset_credit_before_amount BIGINT;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'W06_INVOICE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;

  IF OLD.invoice_status <> 'draft' THEN
    SELECT COALESCE(sum(amount), 0), COALESCE(min(invoice_credit_before_amount), 0)
      INTO backed_offset_amount, offset_credit_before_amount
      FROM contract_settlement_deposit_offsets WHERE invoice_id = OLD.id;

    IF NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.resident_id IS DISTINCT FROM OLD.resident_id
      OR NEW.room_id IS DISTINCT FROM OLD.room_id
      OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
      OR NEW.installment_id IS DISTINCT FROM OLD.installment_id
      OR NEW.invoice_purpose IS DISTINCT FROM OLD.invoice_purpose
      OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.cycle_start_date IS DISTINCT FROM OLD.cycle_start_date
      OR NEW.cycle_end_date IS DISTINCT FROM OLD.cycle_end_date
      OR NEW.snapshot_room_number IS DISTINCT FROM OLD.snapshot_room_number
      OR NEW.snapshot_resident_name IS DISTINCT FROM OLD.snapshot_resident_name
      OR NEW.snapshot_contract_rent_amount IS DISTINCT FROM OLD.snapshot_contract_rent_amount
      OR NEW.credit_amount < OLD.credit_amount
       OR (
         NEW.credit_amount IS DISTINCT FROM OLD.credit_amount
         AND (
           backed_offset_amount = 0
           OR NEW.credit_amount <> offset_credit_before_amount + backed_offset_amount
         )
       )
    THEN
      RAISE EXCEPTION 'W06_ISSUED_INVOICE_IMMUTABLE' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
