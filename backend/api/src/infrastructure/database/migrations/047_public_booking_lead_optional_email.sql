-- KMO-W03: public booking leads may use WhatsApp as their sole contact channel.
-- University/education and informed consent remain mandatory for public submissions.
BEGIN;

ALTER TABLE booking_leads
  DROP CONSTRAINT IF EXISTS booking_leads_public_contact_authority_check;

ALTER TABLE booking_leads
  ADD CONSTRAINT booking_leads_public_contact_authority_check
  CHECK (
    source <> 'public_kamar'
    OR (
      visitor_university IS NOT NULL
      AND consent_at IS NOT NULL
      AND consent_version = 'public-lead-v1'
    )
  ) NOT VALID;

COMMIT;
