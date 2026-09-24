BEGIN;

ALTER TABLE property_owner_profiles
  ADD COLUMN IF NOT EXISTS payout_bank_name TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_number TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS owner_visible_note TEXT;

ALTER TABLE property_owner_profiles
  DROP CONSTRAINT IF EXISTS property_owner_profiles_payout_fields_check;

ALTER TABLE property_owner_profiles
  ADD CONSTRAINT property_owner_profiles_payout_fields_check CHECK (
    (payout_bank_name IS NULL AND payout_account_number IS NULL AND payout_account_holder IS NULL)
    OR (
      length(btrim(payout_bank_name)) BETWEEN 2 AND 120
      AND length(btrim(payout_account_number)) BETWEEN 4 AND 64
      AND length(btrim(payout_account_holder)) BETWEEN 2 AND 150
    )
  );

ALTER TABLE property_owner_profiles
  DROP CONSTRAINT IF EXISTS property_owner_profiles_owner_note_check;

ALTER TABLE property_owner_profiles
  ADD CONSTRAINT property_owner_profiles_owner_note_check CHECK (
    owner_visible_note IS NULL OR length(owner_visible_note) <= 2000
  );

COMMIT;
