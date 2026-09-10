BEGIN;

ALTER TABLE building_owner_assignments
  ALTER COLUMN reason DROP NOT NULL;

ALTER TABLE room_owner_assignments
  ALTER COLUMN reason DROP NOT NULL;

ALTER TABLE building_owner_assignments
  DROP CONSTRAINT IF EXISTS building_owner_assignments_reason_check;

ALTER TABLE room_owner_assignments
  DROP CONSTRAINT IF EXISTS room_owner_assignments_reason_check;

ALTER TABLE building_owner_assignments
  ADD CONSTRAINT building_owner_assignments_reason_check
  CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500);

ALTER TABLE room_owner_assignments
  ADD CONSTRAINT room_owner_assignments_reason_check
  CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 3 AND 500);

COMMIT;
