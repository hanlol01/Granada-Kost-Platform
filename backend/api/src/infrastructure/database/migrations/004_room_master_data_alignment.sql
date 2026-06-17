ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS gender_policy TEXT NOT NULL DEFAULT 'mixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_gender_policy_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_gender_policy_check
      CHECK (gender_policy IN ('male', 'female', 'mixed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_property_unit_code
  ON rooms(property_id, unit_code)
  WHERE unit_code IS NOT NULL;
