-- Append-only authority for correcting committed lease dates, duration, and check-in facts.
-- Existing invoices, payments, lifecycle history, and settlement snapshots remain preserved.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.invoices') IS NULL
     OR to_regclass('public.lease_history') IS NULL
     OR to_regclass('public.lease_contract_paid_documents') IS NULL
     OR to_regclass('public.contract_settlement_deposit_offsets') IS NULL
     OR to_regclass('public.lease_checkout_invoice_credits') IS NULL THEN
    RAISE EXCEPTION 'LEASE_DATA_CORRECTION_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS lease_data_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL,
  correction_kind TEXT NOT NULL,
  previous_snapshot JSONB NOT NULL,
  corrected_snapshot JSONB NOT NULL,
  contract_amount_delta BIGINT NOT NULL DEFAULT 0,
  additional_charge_amount BIGINT NOT NULL DEFAULT 0,
  contract_credit_amount BIGINT NOT NULL DEFAULT 0,
  verified_rent_payment_amount BIGINT NOT NULL DEFAULT 0,
  outstanding_amount_after BIGINT NOT NULL DEFAULT 0,
  overpayment_amount_after BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_fingerprint TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_data_corrections_sequence_unique UNIQUE (lease_id, sequence_number),
  CONSTRAINT lease_data_corrections_command_unique UNIQUE (property_id, command_fingerprint),
  CONSTRAINT lease_data_corrections_kind_check CHECK (
    correction_kind IN ('check_in_date','contract_start','contract_term','contract_period','combined')
  ),
  CONSTRAINT lease_data_corrections_snapshots_check CHECK (
    jsonb_typeof(previous_snapshot)='object' AND jsonb_typeof(corrected_snapshot)='object'
  ),
  CONSTRAINT lease_data_corrections_amount_check CHECK (
    additional_charge_amount=GREATEST(contract_amount_delta,0)
    AND contract_credit_amount=GREATEST(-contract_amount_delta,0)
    AND verified_rent_payment_amount>=0
    AND outstanding_amount_after>=0
    AND overpayment_amount_after>=0
  ),
  CONSTRAINT lease_data_corrections_reason_check CHECK (
    char_length(trim(reason)) BETWEEN 3 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_data_corrections_timeline
  ON lease_data_corrections(property_id, lease_id, sequence_number DESC);

CREATE TABLE IF NOT EXISTS lease_data_correction_invoice_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  correction_id UUID NOT NULL REFERENCES lease_data_corrections(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  invoice_credit_before_amount BIGINT NOT NULL CHECK (invoice_credit_before_amount >= 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_data_correction_invoice_credits_unique UNIQUE (correction_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_lease_data_correction_invoice_credit_invoice
  ON lease_data_correction_invoice_credits(invoice_id, created_at);

ALTER TABLE lease_contract_paid_documents
  ADD COLUMN IF NOT EXISTS invalidated_by_lease_correction_id UUID
    REFERENCES lease_data_corrections(id) ON DELETE RESTRICT;

ALTER TABLE lease_contract_paid_documents
  DROP CONSTRAINT IF EXISTS lease_contract_paid_documents_invalidation_check;
ALTER TABLE lease_contract_paid_documents
  ADD CONSTRAINT lease_contract_paid_documents_invalidation_check CHECK (
    (invalidated_at IS NULL
      AND invalidated_by_reversal_id IS NULL
      AND invalidated_by_lease_correction_id IS NULL
      AND invalidation_reason IS NULL)
    OR (
      invalidated_at IS NOT NULL
      AND num_nonnulls(invalidated_by_reversal_id, invalidated_by_lease_correction_id)=1
      AND char_length(trim(invalidation_reason)) BETWEEN 3 AND 1000
    )
  );

CREATE OR REPLACE FUNCTION guard_lease_contract_paid_document_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.property_id,NEW.lease_id,NEW.settlement_id,NEW.settling_payment_id,
         NEW.document_code,NEW.safe_snapshot,NEW.issued_at,NEW.issued_by_user_id)
     IS DISTINCT FROM
     ROW(OLD.property_id,OLD.lease_id,OLD.settlement_id,OLD.settling_payment_id,
         OLD.document_code,OLD.safe_snapshot,OLD.issued_at,OLD.issued_by_user_id) THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_IMMUTABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.invalidated_at IS NOT NULL AND ROW(
       NEW.invalidated_at,NEW.invalidated_by_reversal_id,
       NEW.invalidated_by_lease_correction_id,NEW.invalidation_reason
     ) IS DISTINCT FROM ROW(
       OLD.invalidated_at,OLD.invalidated_by_reversal_id,
       OLD.invalidated_by_lease_correction_id,OLD.invalidation_reason
     ) THEN
    RAISE EXCEPTION 'CONTRACT_PAID_DOCUMENT_INVALIDATION_IMMUTABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_lease_data_correction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEASE_DATA_CORRECTION_APPEND_ONLY' USING ERRCODE='check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_data_corrections_append_only ON lease_data_corrections;
CREATE TRIGGER trg_lease_data_corrections_append_only
  BEFORE UPDATE OR DELETE ON lease_data_corrections
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

DROP TRIGGER IF EXISTS trg_lease_data_correction_invoice_credits_append_only
  ON lease_data_correction_invoice_credits;
CREATE TRIGGER trg_lease_data_correction_invoice_credits_append_only
  BEFORE UPDATE OR DELETE ON lease_data_correction_invoice_credits
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

-- Preserve issued invoices. A credit can grow only when immutable evidence rows
-- across the existing deposit, checkout, or lease-correction authorities explain
-- the exact cumulative value.
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
    SELECT COALESCE(sum(amount),0), COALESCE(min(invoice_credit_before_amount),0)
      INTO backed_offset_amount, offset_credit_before_amount
      FROM (
        SELECT amount,invoice_credit_before_amount FROM contract_settlement_deposit_offsets WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount FROM lease_checkout_invoice_credits WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount FROM lease_data_correction_invoice_credits WHERE invoice_id=OLD.id
      ) offset_evidence;
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
      OR (NEW.credit_amount IS DISTINCT FROM OLD.credit_amount AND (
        backed_offset_amount=0 OR NEW.credit_amount<>offset_credit_before_amount+backed_offset_amount
      ))
    THEN RAISE EXCEPTION 'W06_ISSUED_INVOICE_IMMUTABLE' USING ERRCODE='check_violation'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_history_event_type_check' AND conrelid='lease_history'::regclass
  ) THEN
    ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
  END IF;
  ALTER TABLE lease_history ADD CONSTRAINT lease_history_event_type_check CHECK (
    event_type IN (
      'created','updated','invoice_generated','deposit_collected','deposit_refunded','deposit_deducted','closed',
      'transferred_out','transferred_in','transfer_scheduled','transfer_cancelled','transfer_failed',
      'renewal_intent','renewal_approved','renewal_financial_prepared','renewal_activation_authorized','renewed_out','renewed_in','renewal_cancelled','renewal_failed',
      'checkout_notice_received','checkout_scheduled','checkout_handover_recorded','checkout_inspection_recorded','checkout_completed','checkout_cancelled',
      'checkout_notice_edited','checkout_approval_edited','checkout_revision_requested',
      'activated','activation_attention_required','check_in_confirmation_required','check_in_confirmed',
      'lease_data_corrected'
    )
  );
END;
$$;

COMMENT ON TABLE lease_data_corrections IS
  'Append-only before/after authority for Admin lease data corrections; introduced by migration 086.';

COMMIT;
