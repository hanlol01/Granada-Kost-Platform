BEGIN;

-- Voided drafts remain as audit evidence but no longer occupy an Owner/period
-- slot. This permits the correct historical import to replace an erroneous draft.
ALTER TABLE property_owner_realizations
  DROP CONSTRAINT IF EXISTS property_owner_realizations_owner_period_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owner_realization_non_void_owner_period
  ON property_owner_realizations(property_id, owner_profile_id, realization_period)
  WHERE realization_status <> 'void';

COMMIT;
