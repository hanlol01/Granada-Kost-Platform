-- Allow final-settlement invoice credits to use the immutable adjustment ledger.
-- Existing W06 invoice fields remain append-only and historical records are untouched.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL
     OR to_regclass('public.lease_exit_invoice_adjustments') IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_SETTLEMENT_INVOICE_CREDIT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

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
        SELECT amount,invoice_credit_before_amount
          FROM contract_settlement_deposit_offsets
         WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount
          FROM lease_checkout_invoice_credits
         WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount
          FROM lease_exit_invoice_adjustments
         WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount
          FROM lease_data_correction_invoice_credits
         WHERE invoice_id=OLD.id
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

COMMENT ON FUNCTION protect_w06_invoice_authority() IS
  'Issued invoices remain immutable except for append-only, evidence-backed credits from deposit offsets, checkout settlement adjustments, checkout invoice credits, or lease corrections.';

COMMIT;
