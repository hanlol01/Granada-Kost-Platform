-- KMO-W09A vehicle and parking authority hardening.
-- Assignment history is append-only evidence; the current slot remains the
-- operational read model and is never replaced by this table.
BEGIN;

ALTER TABLE vehicle_files
  ADD COLUMN IF NOT EXISTS issued_at DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE;

CREATE TABLE IF NOT EXISTS parking_assignment_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  slot_id UUID NOT NULL REFERENCES parking_slots(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  reason TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parking_assignment_histories_action_check
    CHECK (action IN ('assigned', 'released')),
  CONSTRAINT parking_assignment_histories_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_pah_property_effective
  ON parking_assignment_histories(property_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_pah_slot_timeline
  ON parking_assignment_histories(slot_id, effective_at ASC);
CREATE INDEX IF NOT EXISTS idx_pah_vehicle_timeline
  ON parking_assignment_histories(vehicle_id, effective_at ASC);

CREATE OR REPLACE FUNCTION protect_parking_assignment_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PARKING_ASSIGNMENT_HISTORY_IMMUTABLE' USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_assignment_history_append_only ON parking_assignment_histories;
CREATE TRIGGER trg_parking_assignment_history_append_only
  BEFORE UPDATE OR DELETE ON parking_assignment_histories
  FOR EACH ROW EXECUTE FUNCTION protect_parking_assignment_history();

COMMIT;
