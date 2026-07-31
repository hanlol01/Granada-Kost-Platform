BEGIN;

-- W04 additive resident identity fields.  These fields are descriptive only;
-- lease, occupancy, room and billing authority remain separate.
ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS university TEXT,
  ADD COLUMN IF NOT EXISTS faculty TEXT,
  ADD COLUMN IF NOT EXISTS major TEXT,
  ADD COLUMN IF NOT EXISTS cohort TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT;

CREATE INDEX IF NOT EXISTS idx_residents_property_name_identity
  ON residents(property_id, full_name, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_property_user_identity
  ON residents(property_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized_identity
  ON users(lower(email))
  WHERE email IS NOT NULL;

COMMIT;
