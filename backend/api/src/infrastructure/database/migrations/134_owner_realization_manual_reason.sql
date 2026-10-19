BEGIN;

DO $$
BEGIN
  IF to_regclass('public.property_owner_realizations') IS NULL THEN
    RAISE EXCEPTION 'property_owner_realizations must exist before manual realization reasons can be added';
  END IF;
END $$;

ALTER TABLE property_owner_realizations
  ADD COLUMN IF NOT EXISTS manual_reason TEXT;

ALTER TABLE property_owner_realizations
  DROP CONSTRAINT IF EXISTS property_owner_realizations_manual_reason_check;

ALTER TABLE property_owner_realizations
  ADD CONSTRAINT property_owner_realizations_manual_reason_check CHECK (
    manual_reason IS NULL
    OR char_length(trim(manual_reason)) BETWEEN 5 AND 1000
  );

COMMENT ON COLUMN property_owner_realizations.manual_reason IS
  'The current Draft-level reason for all manually selected Owner Realization lines. It is distinct from optional preparation notes and may be updated only while the Draft is amended.';

COMMIT;
