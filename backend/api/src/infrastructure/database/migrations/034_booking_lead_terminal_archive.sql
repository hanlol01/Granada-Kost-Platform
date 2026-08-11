-- Terminal booking leads can be removed from operational queues without
-- deleting payment, refund, hold, audit, or idempotency history.
BEGIN;

ALTER TABLE booking_leads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booking_leads_property_archived_created
  ON booking_leads(property_id, archived_at, created_at DESC);

COMMIT;
