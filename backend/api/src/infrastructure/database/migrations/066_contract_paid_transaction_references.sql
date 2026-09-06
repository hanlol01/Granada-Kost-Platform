-- Capture every verified rent transaction and its net amount in the immutable
-- contract-paid snapshot so the official proof can explain the settlement.
BEGIN;

CREATE OR REPLACE FUNCTION contract_paid_transaction_references(
  p_property_id UUID,
  p_lease_id UUID,
  p_settlement_id UUID
)
RETURNS JSONB LANGUAGE SQL STABLE AS $$
  WITH settlement_scope AS (
    SELECT settlement.policy_snapshot_id, settlement.invoice_id
      FROM lease_contract_settlements settlement
     WHERE settlement.id = p_settlement_id
       AND settlement.property_id = p_property_id
       AND settlement.lease_id = p_lease_id
  ),
  scoped_payment AS (
    SELECT payment.id,
           payment.payment_code,
           payment.paid_at,
           SUM(
             payment_allocation.allocated_amount
             - COALESCE(reversal.reversed_amount, 0)
           )::bigint AS net_amount
      FROM payment_allocations payment_allocation
      JOIN invoices invoice
        ON invoice.id = payment_allocation.invoice_id
       AND invoice.property_id = p_property_id
       AND invoice.lease_id = p_lease_id
       AND invoice.invoice_purpose = 'rent'
       AND invoice.invoice_status <> 'void'
      CROSS JOIN settlement_scope scope
      JOIN payments payment
        ON payment.id = payment_allocation.payment_id
       AND payment.property_id = p_property_id
       AND payment.lease_id = p_lease_id
       AND payment.payment_status = 'verified'
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(reversal_allocation.reversed_amount), 0) AS reversed_amount
          FROM payment_reversal_allocations reversal_allocation
         WHERE reversal_allocation.original_allocation_id = payment_allocation.id
      ) reversal ON true
     WHERE (
       (scope.policy_snapshot_id IS NULL AND invoice.id = scope.invoice_id)
       OR (
         scope.policy_snapshot_id IS NOT NULL
         AND invoice.authority_source = 'contract_schedule'
       )
     )
     GROUP BY payment.id, payment.payment_code, payment.paid_at
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('code', payment_code, 'amount', net_amount)
      ORDER BY paid_at, id
    ) FILTER (WHERE net_amount > 0),
    '[]'::jsonb
  )
    FROM scoped_payment;
$$;

CREATE OR REPLACE FUNCTION attach_contract_paid_transaction_references()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_transaction_references JSONB;
BEGIN
  v_transaction_references := contract_paid_transaction_references(
    NEW.property_id,
    NEW.lease_id,
    NEW.settlement_id
  );

  IF jsonb_array_length(v_transaction_references) > 0 THEN
    NEW.safe_snapshot := jsonb_set(
      COALESCE(NEW.safe_snapshot, '{}'::jsonb),
      '{transactionReferences}',
      v_transaction_references,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_contract_paid_documents_transaction_references
  ON lease_contract_paid_documents;
CREATE TRIGGER trg_lease_contract_paid_documents_transaction_references
BEFORE INSERT ON lease_contract_paid_documents
FOR EACH ROW EXECUTE FUNCTION attach_contract_paid_transaction_references();

-- Existing snapshots receive the same deterministic references. Only the new
-- field is added; all previously issued values and document identity remain
-- unchanged. The immutable guard is restored before this migration commits.
ALTER TABLE lease_contract_paid_documents
  DISABLE TRIGGER trg_lease_contract_paid_documents_immutable;

WITH snapshot_references AS (
  SELECT document.id,
         contract_paid_transaction_references(
           document.property_id,
           document.lease_id,
           document.settlement_id
         ) AS transaction_references
    FROM lease_contract_paid_documents document
)
UPDATE lease_contract_paid_documents document
   SET safe_snapshot = jsonb_set(
     document.safe_snapshot,
     '{transactionReferences}',
     snapshot_references.transaction_references,
     true
   )
  FROM snapshot_references
 WHERE document.id = snapshot_references.id
   AND jsonb_array_length(snapshot_references.transaction_references) > 0
   AND jsonb_typeof(document.safe_snapshot->'transactionReferences') IS DISTINCT FROM 'array';

ALTER TABLE lease_contract_paid_documents
  ENABLE TRIGGER trg_lease_contract_paid_documents_immutable;

COMMIT;
