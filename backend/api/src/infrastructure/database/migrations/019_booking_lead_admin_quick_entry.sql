-- Admin quick-entry booking leads remain interest records only. This migration
-- adds room context and creator attribution without changing room lifecycle.

BEGIN;

ALTER TABLE booking_leads
  ADD COLUMN IF NOT EXISTS room_id UUID,
  ADD COLUMN IF NOT EXISTS visitor_address TEXT,
  ADD COLUMN IF NOT EXISTS visitor_university TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_leads_room_id_fkey'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_room_id_fkey
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_leads_created_by_user_id_fkey'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  source_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO source_definition
  FROM pg_constraint
  WHERE conname = 'booking_leads_source_check'
    AND conrelid = 'booking_leads'::regclass;

  IF source_definition IS NOT NULL
     AND source_definition NOT LIKE '%admin_quick_entry%' THEN
    ALTER TABLE booking_leads DROP CONSTRAINT booking_leads_source_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_leads_source_check'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_source_check
      CHECK (source IN ('public_kamar', 'admin_quick_entry'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_leads_visitor_address_length_check'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_visitor_address_length_check
      CHECK (
        visitor_address IS NULL
        OR char_length(trim(visitor_address)) BETWEEN 5 AND 500
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_leads_visitor_university_length_check'
      AND conrelid = 'booking_leads'::regclass
  ) THEN
    ALTER TABLE booking_leads
      ADD CONSTRAINT booking_leads_visitor_university_length_check
      CHECK (
        visitor_university IS NULL
        OR char_length(trim(visitor_university)) BETWEEN 2 AND 160
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_leads_property_room_created
  ON booking_leads(property_id, room_id, created_at DESC)
  WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_leads_admin_duplicate
  ON booking_leads(property_id, room_id, visitor_phone, created_at DESC)
  WHERE room_id IS NOT NULL AND source = 'admin_quick_entry';

COMMIT;
