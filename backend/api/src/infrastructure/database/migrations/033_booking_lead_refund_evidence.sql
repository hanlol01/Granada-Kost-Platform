-- Refund proof is immutable supporting evidence for a cancelled paid booking
-- lead.  It is separate from the original payment proof and never changes the
-- original booking-payment commitment.
BEGIN;

ALTER TABLE booking_lead_payment_commitment_refunds
  ADD COLUMN IF NOT EXISTS refund_evidence_file_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE booking_lead_payment_commitment_refunds
  DROP CONSTRAINT IF EXISTS booking_lead_payment_commitment_refunds_evidence_limit_check;
ALTER TABLE booking_lead_payment_commitment_refunds
  ADD CONSTRAINT booking_lead_payment_commitment_refunds_evidence_limit_check
  CHECK (cardinality(refund_evidence_file_ids) <= 3);

COMMIT;
