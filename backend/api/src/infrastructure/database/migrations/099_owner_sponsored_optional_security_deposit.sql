-- A security deposit remains an optional refundable liability for a
-- Owner-sponsored occupancy. It must never become room rent, DP, or a
-- management-fee obligation, but verified deposit funding must be allowed.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.onboarding_commitments') IS NULL THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_OPTIONAL_DEPOSIT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_security_deposit_limit_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_security_deposit_limit_check CHECK (
    commercial_mode = 'owner_sponsored'
    OR security_deposit_funded_amount <= contract_rent_amount / NULLIF(term_months, 0)
  ) NOT VALID;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_custom_pricing_snapshot_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_custom_pricing_snapshot_check CHECK (
    (
      commercial_mode = 'rent'
      AND snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
      AND snapshot_reference_monthly_price > 0
      AND snapshot_monthly_price > 0
      AND contract_rent_amount = snapshot_monthly_price * term_months
      AND pricing_source IN ('standard', 'negotiated')
      AND pricing_agreed_at IS NOT NULL
      AND (
        (pricing_source = 'standard'
          AND snapshot_monthly_price = snapshot_reference_monthly_price
          AND pricing_agreement_reason IS NULL)
        OR
        (pricing_source = 'negotiated'
          AND pricing_agreed_by_user_id IS NOT NULL
          AND pricing_agreement_reason IS NOT NULL
          AND char_length(trim(pricing_agreement_reason)) BETWEEN 3 AND 500)
      )
    ) OR (
      commercial_mode = 'owner_sponsored'
      AND snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
      AND snapshot_reference_monthly_price > 0
      AND snapshot_monthly_price = 0
      AND contract_rent_amount = 0
      AND dp_required_amount = 0
      AND dp_verified_amount = 0
      AND booking_fee_paid_amount = 0
      AND security_deposit_required_amount = 0
      AND pricing_source = 'owner_sponsored'
      AND sponsoring_owner_profile_id IS NOT NULL
      AND char_length(trim(COALESCE(owner_sponsorship_reason,''))) BETWEEN 3 AND 500
      AND pricing_agreed_by_user_id IS NOT NULL
      AND pricing_agreed_at IS NOT NULL
      AND (
        (management_fee_mode='charged'
          AND management_fee_payer IN ('resident','owner','other')
          AND (management_fee_payer <> 'other'
            OR char_length(trim(COALESCE(management_fee_payer_name,''))) BETWEEN 2 AND 160)
          AND snapshot_monthly_management_fee > 0
          AND projected_management_fee_amount = snapshot_monthly_management_fee * term_months)
        OR
        (management_fee_mode='waived'
          AND management_fee_payer IS NULL
          AND management_fee_payer_name IS NULL
          AND snapshot_monthly_management_fee = 0
          AND projected_management_fee_amount = 0)
      )
    )
  );

COMMIT;
