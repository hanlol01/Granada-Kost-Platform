-- KMO resident/lease form policy: flexible historical start dates, a three-month
-- minimum term, and an optional booking fee recorded separately from DP/deposit.
BEGIN;

ALTER TABLE leases
  DROP CONSTRAINT IF EXISTS leases_term_months_check;

ALTER TABLE leases
  ADD CONSTRAINT leases_term_months_check
  CHECK (term_months IS NULL OR term_months >= 3);

ALTER TABLE leases
  DROP CONSTRAINT IF EXISTS leases_payment_plan_check;

ALTER TABLE leases
  ADD CONSTRAINT leases_payment_plan_check
  CHECK (
    payment_plan_type IS NULL
    OR payment_plan_type IN ('annual_full', 'two_month_installments', 'monthly_installments')
  );

ALTER TABLE onboarding_commitments
  ADD COLUMN IF NOT EXISTS booking_fee_paid_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_term_check;

ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_term_check CHECK (term_months >= 3);

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_plan_check;

ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_plan_check CHECK (
    payment_plan_type IN ('annual_full', 'two_month_installments', 'monthly_installments')
  );

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_amounts_check;

ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_amounts_check CHECK (
    contract_rent_amount >= 0
    AND dp_required_amount >= 0
    AND dp_verified_amount >= 0
    AND security_deposit_required_amount >= 0
    AND security_deposit_funded_amount >= 0
    AND booking_fee_paid_amount >= 0
  );

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_w06_payment_plan_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_w06_payment_plan_check CHECK (
    snapshot_payment_plan_type IS NULL
    OR snapshot_payment_plan_type IN ('annual_full', 'two_month_installments', 'monthly_installments')
  );

COMMIT;
