-- Admin UX M14 booking-lead room holds.
-- The repository migration runner replays every file, so this migration is
-- additive, transactional, and safe to execute again.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.booking_leads') IS NULL
     OR to_regclass('public.rooms') IS NULL
     OR to_regclass('public.property_feature_flags') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL
     OR to_regclass('public.business_events') IS NULL THEN
    RAISE EXCEPTION 'M14_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END $$;

ALTER TABLE property_feature_flags
  ADD COLUMN IF NOT EXISTS booking_hold_write BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'property_feature_flags_booking_hold_dependency_check'
      AND conrelid = 'property_feature_flags'::regclass
  ) THEN
    ALTER TABLE property_feature_flags
      ADD CONSTRAINT property_feature_flags_booking_hold_dependency_check
      CHECK (NOT booking_hold_write OR admin_ux_read);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS booking_lead_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  booking_lead_id UUID NOT NULL REFERENCES booking_leads(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  hold_status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  released_at TIMESTAMPTZ,
  released_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_lead_holds_status_check CHECK (
    hold_status IN ('active', 'released', 'expired')
  ),
  CONSTRAINT booking_lead_holds_time_order_check CHECK (expires_at > starts_at),
  CONSTRAINT booking_lead_holds_ttl_check CHECK (
    expires_at = starts_at + interval '24 hours'
  ),
  CONSTRAINT booking_lead_holds_release_timestamp_check CHECK (
    (hold_status = 'released' AND released_at IS NOT NULL)
    OR (hold_status IN ('active', 'expired') AND released_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_holds_active_room
  ON booking_lead_holds(room_id)
  WHERE hold_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_lead_holds_active_lead
  ON booking_lead_holds(booking_lead_id)
  WHERE hold_status = 'active';

CREATE INDEX IF NOT EXISTS idx_booking_lead_holds_property_status_started
  ON booking_lead_holds(property_id, hold_status, starts_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_booking_lead_holds_active_expiry
  ON booking_lead_holds(hold_status, expires_at)
  WHERE hold_status = 'active';

COMMIT;
