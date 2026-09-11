BEGIN;

ALTER TABLE vehicles
  ALTER COLUMN plate_number DROP NOT NULL,
  ALTER COLUMN brand DROP NOT NULL,
  ALTER COLUMN color DROP NOT NULL;

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_plate_required_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicles_optional_fields_nonblank_check'
      AND conrelid = 'vehicles'::regclass
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_optional_fields_nonblank_check
      CHECK (
        (plate_number IS NULL OR length(trim(plate_number)) > 0)
        AND (brand IS NULL OR length(trim(brand)) > 0)
        AND (color IS NULL OR length(trim(color)) > 0)
      );
  END IF;
END $$;

COMMIT;
