BEGIN;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS custom_vehicle_type VARCHAR(60);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicles_custom_type_requires_other_check'
      AND conrelid = 'vehicles'::regclass
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_custom_type_requires_other_check
      CHECK (custom_vehicle_type IS NULL OR vehicle_type = 'other');
  END IF;
END $$;

COMMIT;
