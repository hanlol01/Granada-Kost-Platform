-- Owner-sponsored occupancy may explicitly waive both room rent and the
-- Kostation management fee. Existing sponsored leases remain fee-charged.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.onboarding_commitments') IS NULL
     OR to_regclass('public.owner_sponsored_lease_terms') IS NULL THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_OPTIONAL_FEE_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE onboarding_commitments
  ADD COLUMN IF NOT EXISTS management_fee_mode TEXT;

UPDATE onboarding_commitments
   SET management_fee_mode='charged'
 WHERE commercial_mode='owner_sponsored'
   AND management_fee_mode IS NULL;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_management_fee_mode_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_management_fee_mode_check CHECK (
    (commercial_mode='rent' AND management_fee_mode IS NULL)
    OR (commercial_mode='owner_sponsored' AND management_fee_mode IN ('charged','waived'))
  );

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
      AND security_deposit_funded_amount = 0
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

ALTER TABLE owner_sponsored_lease_terms
  ADD COLUMN IF NOT EXISTS management_fee_mode TEXT NOT NULL DEFAULT 'charged';
ALTER TABLE owner_sponsored_lease_terms
  ALTER COLUMN management_fee_payer DROP NOT NULL;

ALTER TABLE owner_sponsored_lease_terms
  DROP CONSTRAINT IF EXISTS owner_sponsored_terms_fee_mode_check;
ALTER TABLE owner_sponsored_lease_terms
  ADD CONSTRAINT owner_sponsored_terms_fee_mode_check CHECK (
    management_fee_mode IN ('charged','waived')
  );
ALTER TABLE owner_sponsored_lease_terms
  DROP CONSTRAINT IF EXISTS owner_sponsored_terms_payer_check;
ALTER TABLE owner_sponsored_lease_terms
  ADD CONSTRAINT owner_sponsored_terms_payer_check CHECK (
    (management_fee_mode='charged' AND management_fee_payer IN ('resident','owner','other'))
    OR (management_fee_mode='waived' AND management_fee_payer IS NULL)
  );
ALTER TABLE owner_sponsored_lease_terms
  DROP CONSTRAINT IF EXISTS owner_sponsored_terms_payer_name_check;
ALTER TABLE owner_sponsored_lease_terms
  ADD CONSTRAINT owner_sponsored_terms_payer_name_check CHECK (
    (management_fee_mode='charged'
      AND (management_fee_payer <> 'other'
        OR char_length(trim(COALESCE(management_fee_payer_name,''))) BETWEEN 2 AND 160))
    OR (management_fee_mode='waived' AND management_fee_payer_name IS NULL)
  );
ALTER TABLE owner_sponsored_lease_terms
  DROP CONSTRAINT IF EXISTS owner_sponsored_terms_money_check;
ALTER TABLE owner_sponsored_lease_terms
  ADD CONSTRAINT owner_sponsored_terms_money_check CHECK (
    (management_fee_mode='charged'
      AND snapshot_monthly_management_fee > 0
      AND projected_management_fee_amount > 0)
    OR (management_fee_mode='waived'
      AND snapshot_monthly_management_fee = 0
      AND projected_management_fee_amount = 0)
  );

DROP VIEW IF EXISTS owner_sponsored_management_fee_progress;

CREATE VIEW owner_sponsored_management_fee_progress AS
WITH projected AS (
  SELECT term.id AS term_id,
         CASE WHEN term.management_fee_mode='waived' THEN 0
              ELSE COALESCE(sum(COALESCE(fee.monthly_fee_amount,term.snapshot_monthly_management_fee)),0)
         END::bigint AS projected_amount
  FROM owner_sponsored_lease_terms term
  JOIN leases lease ON lease.id=term.lease_id
  CROSS JOIN LATERAL generate_series(0,lease.term_months-1) AS month_index(value)
  LEFT JOIN LATERAL (
    SELECT version.monthly_fee_amount
    FROM property_management_fee_versions version
    WHERE version.property_id=term.property_id
      AND version.effective_date<=(lease.start_date+(month_index.value||' months')::interval)::date
    ORDER BY version.effective_date DESC,version.id DESC LIMIT 1
  ) fee ON true
  GROUP BY term.id,term.management_fee_mode
), paid AS (
  SELECT term.id AS term_id,
         COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_status='verified'),0)::bigint
           AS verified_paid_amount,
         COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_status='pending_confirmation'),0)::bigint
           AS pending_amount
  FROM owner_sponsored_lease_terms term
  LEFT JOIN payments payment ON payment.property_id=term.property_id
    AND payment.lease_id=term.lease_id AND payment.payment_purpose='management_fee'
  GROUP BY term.id
)
SELECT term.*,
       projected.projected_amount AS current_projected_management_fee_amount,
       paid.verified_paid_amount,
       paid.pending_amount,
       GREATEST(
         projected.projected_amount-paid.verified_paid_amount-paid.pending_amount,
         0
       )::bigint AS remaining_amount,
       CASE
         WHEN term.management_fee_mode='waived' THEN 'waived'
         WHEN paid.verified_paid_amount>projected.projected_amount THEN 'overpaid'
         WHEN paid.verified_paid_amount=projected.projected_amount THEN 'paid'
         WHEN paid.verified_paid_amount+paid.pending_amount>0 THEN 'partially_paid'
         ELSE 'unpaid'
       END AS payment_status
FROM owner_sponsored_lease_terms term
JOIN projected ON projected.term_id=term.id
JOIN paid ON paid.term_id=term.id;

COMMIT;
