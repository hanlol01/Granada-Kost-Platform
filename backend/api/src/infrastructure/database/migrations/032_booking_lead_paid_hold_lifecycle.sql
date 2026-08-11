-- Paid booking-lead commitments reserve their selected room until the lead is
-- converted to a lease or explicitly cancelled/refunded. They must not expire
-- under the 24-hour provisional-hold worker.
BEGIN;

ALTER TABLE booking_lead_holds
  DROP CONSTRAINT IF EXISTS booking_lead_holds_status_check;
ALTER TABLE booking_lead_holds
  ADD CONSTRAINT booking_lead_holds_status_check
  CHECK (hold_status IN ('active', 'committed', 'released', 'expired'));

ALTER TABLE booking_lead_holds
  DROP CONSTRAINT IF EXISTS booking_lead_holds_release_timestamp_check;
ALTER TABLE booking_lead_holds
  ADD CONSTRAINT booking_lead_holds_release_timestamp_check
  CHECK (
    (hold_status = 'released' AND released_at IS NOT NULL)
    OR (hold_status IN ('active', 'committed', 'expired') AND released_at IS NULL)
  );

DROP INDEX IF EXISTS uq_booking_lead_holds_active_room;
DROP INDEX IF EXISTS uq_booking_lead_holds_active_lead;
CREATE UNIQUE INDEX uq_booking_lead_holds_active_room
  ON booking_lead_holds(room_id)
  WHERE hold_status IN ('active', 'committed');
CREATE UNIQUE INDEX uq_booking_lead_holds_active_lead
  ON booking_lead_holds(booking_lead_id)
  WHERE hold_status IN ('active', 'committed');

-- A paid booking lead may be cancelled only before onboarding materializes a
-- lease.  Keep the refund as a separate immutable business record instead of
-- deleting or mutating the original payment commitment.
CREATE TABLE IF NOT EXISTS booking_lead_payment_commitment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  booking_lead_id UUID NOT NULL REFERENCES booking_leads(id) ON DELETE RESTRICT,
  commitment_id UUID NOT NULL UNIQUE REFERENCES booking_lead_payment_commitments(id) ON DELETE RESTRICT,
  hold_id UUID NOT NULL REFERENCES booking_lead_holds(id) ON DELETE RESTRICT,
  refund_amount BIGINT NOT NULL CHECK (refund_amount >= 0),
  refund_method TEXT NOT NULL CHECK (refund_method IN ('cash', 'bank_transfer')),
  refund_note TEXT NULL CHECK (refund_note IS NULL OR char_length(refund_note) <= 500),
  refunded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  refunded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_lead_payment_commitment_refunds_scope_check
    CHECK (refund_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_booking_lead_commitment_refunds_property_lead
  ON booking_lead_payment_commitment_refunds(property_id, booking_lead_id, refunded_at DESC);

COMMIT;
