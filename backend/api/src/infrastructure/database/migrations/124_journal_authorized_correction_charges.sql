-- Routine period uniqueness stays enforced. A correction is a separate,
-- journal-authorized obligation, not a duplicate routine installment.
BEGIN;

ALTER TABLE lease_installments ADD COLUMN correction_id UUID
  REFERENCES lease_data_corrections(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX lease_installments_correction_unique
  ON lease_installments(correction_id) WHERE correction_id IS NOT NULL;

CREATE FUNCTION validate_lease_correction_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.correction_id IS DISTINCT FROM OLD.correction_id THEN
    RAISE EXCEPTION 'LEASE_CORRECTION_CHARGE_LINK_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF NEW.correction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lease_data_corrections amendment
    WHERE amendment.id=NEW.correction_id AND amendment.lease_id=NEW.lease_id
      AND amendment.property_id=NEW.property_id
      AND amendment.additional_charge_amount=NEW.scheduled_amount AND amendment.additional_charge_amount>0
  ) THEN
    RAISE EXCEPTION 'LEASE_CORRECTION_CHARGE_AUTHORITY_INVALID' USING ERRCODE='23514';
  END IF;
  IF NEW.correction_id IS NOT NULL AND NEW.invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM invoices invoice WHERE invoice.id=NEW.invoice_id AND invoice.installment_id=NEW.id
      AND invoice.lease_id=NEW.lease_id AND invoice.property_id=NEW.property_id
      AND invoice.command_fingerprint='lease-correction:'||NEW.correction_id::text
  ) THEN
    RAISE EXCEPTION 'LEASE_CORRECTION_CHARGE_INVOICE_INVALID' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lease_correction_charge_validate BEFORE INSERT OR UPDATE ON lease_installments
  FOR EACH ROW EXECUTE FUNCTION validate_lease_correction_charge();

CREATE FUNCTION validate_lease_correction_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amendment_id UUID;
BEGIN
  SELECT correction_id INTO amendment_id FROM lease_installments WHERE id=NEW.installment_id;
  IF amendment_id IS NOT NULL OR NEW.command_fingerprint LIKE 'lease-correction:%' THEN
    IF NOT EXISTS (
      SELECT 1 FROM lease_installments installment JOIN lease_data_corrections amendment ON amendment.id=installment.correction_id
      WHERE installment.id=NEW.installment_id AND installment.property_id=NEW.property_id AND installment.lease_id=NEW.lease_id
        AND amendment.property_id=NEW.property_id AND amendment.lease_id=NEW.lease_id
        AND NEW.command_fingerprint='lease-correction:'||amendment.id::text
        AND NEW.invoice_purpose='rent' AND NEW.authority_source='contract_schedule'
        AND NEW.total_amount=amendment.additional_charge_amount AND NEW.total_amount=installment.scheduled_amount
        AND amendment.additional_charge_amount>0
    ) THEN
      RAISE EXCEPTION 'LEASE_CORRECTION_INVOICE_AUTHORITY_INVALID' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lease_correction_invoice_validate BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION validate_lease_correction_invoice();

DROP INDEX lease_installments_current_period_unique;
CREATE UNIQUE INDEX lease_installments_current_period_unique
  ON lease_installments(lease_id,coverage_start_date)
  WHERE installment_status<>'void' AND correction_id IS NULL;
DROP INDEX idx_invoices_lease_cycle_start_unique;
CREATE UNIQUE INDEX idx_invoices_lease_cycle_start_unique
  ON invoices(lease_id,cycle_start_date)
  WHERE lease_id IS NOT NULL AND invoice_status<>'void'
    AND (command_fingerprint IS NULL OR command_fingerprint NOT LIKE 'lease-correction:%');

COMMENT ON COLUMN lease_installments.correction_id IS
  'H08 additive charge authority: one immutable installment per recorded positive correction; routine period uniqueness is retained.';
COMMIT;
