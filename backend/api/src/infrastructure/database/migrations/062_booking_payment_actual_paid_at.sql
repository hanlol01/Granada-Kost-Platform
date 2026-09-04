ALTER TABLE booking_lead_payment_commitments
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

UPDATE booking_lead_payment_commitments
SET paid_at = created_at
WHERE paid_at IS NULL;

ALTER TABLE booking_lead_payment_commitments
  ALTER COLUMN paid_at SET NOT NULL;

COMMENT ON COLUMN booking_lead_payment_commitments.paid_at IS
  'Actual time the payment was received; distinct from the system record creation time.';
