BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_commitments_rent_credit_limit_check'
      AND conrelid = 'public.onboarding_commitments'::regclass
  ) THEN
    ALTER TABLE onboarding_commitments
      ADD CONSTRAINT onboarding_commitments_rent_credit_limit_check
      CHECK (dp_verified_amount + booking_fee_paid_amount <= contract_rent_amount)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_commitments_security_deposit_limit_check'
      AND conrelid = 'public.onboarding_commitments'::regclass
  ) THEN
    ALTER TABLE onboarding_commitments
      ADD CONSTRAINT onboarding_commitments_security_deposit_limit_check
      CHECK (
        security_deposit_funded_amount <= contract_rent_amount / NULLIF(term_months, 0)
      )
      NOT VALID;
  END IF;
END $$;

COMMIT;
