BEGIN;

-- The lease lock, rather than the reporting month, prevents a contract from
-- being paid to an Owner twice. Several batches may share an Owner and month
-- when another contract becomes fully paid later.
DROP INDEX IF EXISTS uq_property_owner_realization_non_void_owner_period;

CREATE INDEX IF NOT EXISTS idx_property_owner_realization_batches
  ON property_owner_realizations(property_id, owner_profile_id, realization_period, created_at DESC);

COMMIT;
