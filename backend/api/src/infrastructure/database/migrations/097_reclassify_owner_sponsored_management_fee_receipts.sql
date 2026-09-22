-- Reclassify historical owner-sponsored management-fee receipts that were
-- issued under TAGIHAN-LAIN before the dedicated document family existed.
-- The original number/document remain in the snapshot for audit downloads;
-- the primary receipt view uses the corrected BIAYA-PENGELOLAAN number.
BEGIN;

DROP TRIGGER IF EXISTS trg_w06_receipts_append_only ON payment_receipts;

DO $$
DECLARE
  receipt_row RECORD;
  next_code TEXT;
  snapshot JSONB;
BEGIN
  FOR receipt_row IN
    SELECT receipt.id,
           receipt.property_id,
           receipt.receipt_code,
           receipt.issued_at,
           COALESCE(receipt.safe_snapshot, '{}'::jsonb) AS safe_snapshot
      FROM payment_receipts receipt
      JOIN payments payment ON payment.id=receipt.payment_id
       AND payment.property_id=receipt.property_id
     WHERE receipt.receipt_kind='payment'
       AND payment.payment_purpose='management_fee'
       AND receipt.receipt_code LIKE '%/TAGIHAN-LAIN/%'
     ORDER BY receipt.property_id,receipt.issued_at,receipt.id
  LOOP
    SELECT next_billing_document_number(receipt_row.property_id,'receipt_management_fee',receipt_row.issued_at)
      INTO next_code;

    snapshot := jsonb_set(
      jsonb_set(
        receipt_row.safe_snapshot,
        '{original_receipt_code}',
        to_jsonb(receipt_row.receipt_code),
        true
      ),
      '{original_document}',
      COALESCE(receipt_row.safe_snapshot->'document','{}'::jsonb),
      true
    );
    IF jsonb_typeof(snapshot->'document')='object' THEN
      snapshot := jsonb_set(snapshot,'{document,receipt_code}',to_jsonb(next_code),true);
    END IF;

    UPDATE payment_receipts
       SET receipt_code=next_code,
           safe_snapshot=snapshot
     WHERE id=receipt_row.id;
  END LOOP;
END;
$$;

CREATE TRIGGER trg_w06_receipts_append_only
  BEFORE UPDATE OR DELETE ON payment_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_w06_append_only_mutation();

COMMIT;
