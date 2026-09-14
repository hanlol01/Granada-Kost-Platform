-- Deliberate Stage 3 rollout for properties that already have the Admin lease
-- workspace and lease writes enabled. This changes capability configuration
-- only; no lease, occupancy, room, resident, billing, or checkout record is
-- created or rewritten.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.property_feature_flags') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'property_feature_flags'
         AND column_name = 'lease_checkout'
     ) THEN
    RAISE EXCEPTION 'LEASE_CHECKOUT_ROLLOUT_PREREQUISITE_MISSING'
      USING ERRCODE = 'undefined_column';
  END IF;
END;
$$;

UPDATE property_feature_flags
SET lease_checkout = TRUE,
    updated_at = now()
WHERE admin_ux_read = TRUE
  AND lease_write = TRUE
  AND lease_checkout = FALSE;

COMMENT ON COLUMN property_feature_flags.lease_checkout IS
  'Stage 3 checkout authority; enabled for operational Admin lease properties by migration 083.';

COMMIT;
