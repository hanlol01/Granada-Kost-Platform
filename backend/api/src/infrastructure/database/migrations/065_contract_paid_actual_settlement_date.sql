BEGIN;

-- A contract becomes paid on the date of the payment that closes its balance.
-- Verification and document issuance may happen later, especially while Admin
-- is entering historical records, so those timestamps must remain separate.
CREATE OR REPLACE FUNCTION align_contract_paid_actual_settlement_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_paid_at TIMESTAMPTZ;
BEGIN
  SELECT payment.paid_at
    INTO v_paid_at
    FROM payments payment
   WHERE payment.id=NEW.settling_payment_id
     AND payment.property_id=NEW.property_id
     AND payment.lease_id=NEW.lease_id
     AND payment.payment_status='verified';

  IF v_paid_at IS NOT NULL THEN
    NEW.safe_snapshot := jsonb_set(
      COALESCE(NEW.safe_snapshot,'{}'::jsonb),
      '{settledAt}',
      to_jsonb(v_paid_at),
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_contract_paid_documents_actual_settled_at
  ON lease_contract_paid_documents;
CREATE TRIGGER trg_lease_contract_paid_documents_actual_settled_at
BEFORE INSERT ON lease_contract_paid_documents
FOR EACH ROW EXECUTE FUNCTION align_contract_paid_actual_settlement_date();

-- Correct only the factual settlement timestamp in documents issued before
-- this migration. Document number, issuance timestamp, values, and identity
-- remain immutable. The guard is restored inside the same transaction.
ALTER TABLE lease_contract_paid_documents
  DISABLE TRIGGER trg_lease_contract_paid_documents_immutable;

UPDATE lease_contract_paid_documents document
   SET safe_snapshot=jsonb_set(
     document.safe_snapshot,
     '{settledAt}',
     to_jsonb(payment.paid_at),
     true
   )
  FROM payments payment
 WHERE payment.id=document.settling_payment_id
   AND payment.property_id=document.property_id
   AND payment.lease_id=document.lease_id
   AND payment.payment_status='verified'
   AND payment.paid_at IS NOT NULL;

ALTER TABLE lease_contract_paid_documents
  ENABLE TRIGGER trg_lease_contract_paid_documents_immutable;

COMMIT;
