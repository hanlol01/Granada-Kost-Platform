-- Property-scoped university catalog. Existing free-text values are retained
-- and backfilled so the new Admin combobox is useful immediately.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.properties') IS NULL
     OR to_regclass('public.residents') IS NULL
     OR to_regclass('public.booking_leads') IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_UNIVERSITY_CATALOG_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_universities_name_length_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT property_universities_normalized_name_length_check
    CHECK (char_length(normalized_name) BETWEEN 2 AND 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_universities_property_normalized
  ON property_universities(property_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_property_universities_property_name
  ON property_universities(property_id, normalized_name, name);

WITH candidates AS (
  SELECT property_id, btrim(university) AS name
    FROM residents
   WHERE university IS NOT NULL
     AND char_length(btrim(university)) BETWEEN 2 AND 160
  UNION ALL
  SELECT property_id, btrim(visitor_university) AS name
    FROM booking_leads
   WHERE visitor_university IS NOT NULL
     AND char_length(btrim(visitor_university)) BETWEEN 2 AND 160
), normalized AS (
  SELECT DISTINCT ON (property_id, lower(regexp_replace(name, '\s+', ' ', 'g')))
         property_id,
         name,
         lower(regexp_replace(name, '\s+', ' ', 'g')) AS normalized_name
    FROM candidates
   ORDER BY property_id, lower(regexp_replace(name, '\s+', ' ', 'g')), name
)
INSERT INTO property_universities(property_id, name, normalized_name)
SELECT property_id, name, normalized_name
  FROM normalized
ON CONFLICT (property_id, normalized_name) DO NOTHING;

COMMIT;
