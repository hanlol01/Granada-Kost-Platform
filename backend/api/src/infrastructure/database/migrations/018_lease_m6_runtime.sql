-- Admin UX M6 lease transfer and billing scheduler runtime controls.
--
-- The migration runner replays every SQL file. Keep this migration additive and
-- idempotent: a property is disabled until an operator explicitly creates or
-- updates its flag row. No lease, occupancy, invoice, or ledger backfill is
-- performed here.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.business_events') IS NULL
     OR to_regclass('public.room_transfer_records') IS NULL THEN
    RAISE EXCEPTION 'M6_PREREQUISITE_M5_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_feature_flags (
  property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  admin_ux_read BOOLEAN NOT NULL DEFAULT FALSE,
  lease_write BOOLEAN NOT NULL DEFAULT FALSE,
  lease_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  lease_billing_scheduler BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_feature_flags_dependency_check CHECK (
    (NOT lease_write OR admin_ux_read)
    AND (NOT lease_transfer OR lease_write)
    AND (NOT lease_billing_scheduler OR lease_transfer)
  )
);

CREATE INDEX IF NOT EXISTS idx_property_feature_flags_scheduler_enabled
  ON property_feature_flags(property_id)
  WHERE admin_ux_read AND lease_write AND lease_transfer AND lease_billing_scheduler;

COMMIT;
