-- KMO-W03 public lead contact consent authority.
BEGIN;

ALTER TABLE booking_leads
  ADD COLUMN IF NOT EXISTS visitor_email TEXT,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_leads_visitor_email_length_check'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_visitor_email_length_check
      CHECK (visitor_email IS NULL OR char_length(trim(visitor_email)) BETWEEN 3 AND 254);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_leads_public_contact_authority_check'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_public_contact_authority_check
      CHECK (
        source <> 'public_kamar'
        OR (
          visitor_email IS NOT NULL
          AND visitor_university IS NOT NULL
          AND consent_at IS NOT NULL
          AND consent_version = 'public-lead-v1'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_leads_public_email_created
  ON booking_leads(property_id, visitor_email, created_at DESC)
  WHERE source = 'public_kamar' AND visitor_email IS NOT NULL;

COMMIT;
