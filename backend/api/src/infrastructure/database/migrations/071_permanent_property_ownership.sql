BEGIN;

ALTER TABLE building_owner_assignments
  DROP CONSTRAINT building_owner_assignments_dates_check;

ALTER TABLE building_owner_assignments
  ADD CONSTRAINT building_owner_assignments_dates_check CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  );

ALTER TABLE room_owner_assignments
  DROP CONSTRAINT room_owner_assignments_dates_check;

ALTER TABLE room_owner_assignments
  ADD CONSTRAINT room_owner_assignments_dates_check CHECK (
    effective_until IS NULL OR effective_until >= effective_from
  );

COMMIT;
