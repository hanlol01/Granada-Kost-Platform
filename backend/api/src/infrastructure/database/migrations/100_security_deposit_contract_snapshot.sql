-- Security deposit is optional, but its target is a frozen commercial snapshot
-- on the lease. Funding must never change rent, Owner progress, or the contract
-- receivable. Existing leases are reconstructed from the commercial version that
-- was effective on their start date; this only supplies a target for future
-- optional collection and does not rewrite any payment or deposit ledger row.
BEGIN;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_security_deposit_limit_check;

ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_security_deposit_limit_check CHECK (
    commercial_mode = 'owner_sponsored'
    OR security_deposit_funded_amount <=
      (2 * contract_rent_amount) / NULLIF(term_months, 0)
  ) NOT VALID;

UPDATE leases lease
SET snapshot_deposit_amount =
  (CASE
      WHEN lease.commercial_mode = 'owner_sponsored'
        THEN lease.snapshot_reference_monthly_price
      ELSE lease.snapshot_monthly_price
    END) * COALESCE((
      SELECT version.security_deposit_months
      FROM kost_type_commercial_versions version
      WHERE version.kost_type_id = lease.kost_type_id
        AND version.effective_date <= lease.start_date
  ORDER BY version.effective_date DESC, version.id DESC
      LIMIT 1
    ), 1)
WHERE lease.snapshot_deposit_amount = 0
  AND lease.lease_status <> 'cancelled';

ALTER TABLE leases
  DROP CONSTRAINT IF EXISTS leases_snapshot_deposit_amount_nonnegative_check;

ALTER TABLE leases
  ADD CONSTRAINT leases_snapshot_deposit_amount_nonnegative_check
  CHECK (snapshot_deposit_amount >= 0) NOT VALID;

COMMIT;
