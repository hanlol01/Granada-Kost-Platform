-- Physical room moves retain their lease and commercial/payment authority.
-- Allow multiple immutable transfer records for the same lease. No historic
-- rows are changed; active lease/resident/room uniqueness remains enforced.
ALTER TABLE room_transfer_records
  DROP CONSTRAINT IF EXISTS room_transfer_records_from_lease_unique,
  DROP CONSTRAINT IF EXISTS room_transfer_records_to_lease_unique;

CREATE INDEX IF NOT EXISTS idx_room_transfer_records_from_lease
  ON room_transfer_records (from_lease_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_room_transfer_records_to_lease
  ON room_transfer_records (to_lease_id, effective_date DESC);
