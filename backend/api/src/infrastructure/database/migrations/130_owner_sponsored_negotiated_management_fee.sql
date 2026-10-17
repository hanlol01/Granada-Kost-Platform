-- New Owner-sponsored leases use an immutable negotiated management-fee snapshot.
-- Existing leases retain the property-policy calculation that was in force before this migration.
BEGIN;

ALTER TABLE onboarding_commitments
  ADD COLUMN IF NOT EXISTS management_fee_source TEXT,
  ADD COLUMN IF NOT EXISTS management_fee_agreement_note TEXT;

ALTER TABLE owner_sponsored_lease_terms
  ADD COLUMN IF NOT EXISTS management_fee_source TEXT,
  ADD COLUMN IF NOT EXISTS management_fee_agreement_note TEXT;

UPDATE onboarding_commitments
   SET management_fee_source='property_policy'
 WHERE commercial_mode='owner_sponsored' AND management_fee_source IS NULL;

UPDATE owner_sponsored_lease_terms
   SET management_fee_source='property_policy'
 WHERE management_fee_source IS NULL;

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_management_fee_source_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_management_fee_source_check CHECK (
    (commercial_mode='rent' AND management_fee_source IS NULL AND management_fee_agreement_note IS NULL)
    OR (
      commercial_mode='owner_sponsored'
      AND management_fee_source IN ('property_policy','negotiated_snapshot')
      AND (
        (management_fee_mode='charged' AND (
          (management_fee_source='property_policy' AND management_fee_agreement_note IS NULL)
          OR (management_fee_source='negotiated_snapshot'
            AND char_length(trim(COALESCE(management_fee_agreement_note,''))) BETWEEN 3 AND 500)
        ))
        OR (management_fee_mode='waived' AND management_fee_agreement_note IS NULL)
      )
    )
  );

ALTER TABLE owner_sponsored_lease_terms
  ALTER COLUMN management_fee_source SET DEFAULT 'property_policy';
ALTER TABLE owner_sponsored_lease_terms
  ALTER COLUMN management_fee_source SET NOT NULL;
ALTER TABLE owner_sponsored_lease_terms
  DROP CONSTRAINT IF EXISTS owner_sponsored_terms_fee_source_check;
ALTER TABLE owner_sponsored_lease_terms
  ADD CONSTRAINT owner_sponsored_terms_fee_source_check CHECK (
    management_fee_source IN ('property_policy','negotiated_snapshot')
    AND (
      (management_fee_mode='charged' AND (
        (management_fee_source='property_policy' AND management_fee_agreement_note IS NULL)
        OR (management_fee_source='negotiated_snapshot'
          AND char_length(trim(COALESCE(management_fee_agreement_note,''))) BETWEEN 3 AND 500)
      ))
      OR (management_fee_mode='waived' AND management_fee_agreement_note IS NULL)
    )
  );

DROP VIEW IF EXISTS owner_sponsored_management_fee_progress;

CREATE VIEW owner_sponsored_management_fee_progress AS
WITH projected AS (
  SELECT term.id AS term_id,
         CASE
           WHEN term.management_fee_mode='waived' THEN 0
           WHEN term.management_fee_source='negotiated_snapshot'
             THEN term.projected_management_fee_amount
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
   GROUP BY term.id,term.management_fee_mode,term.management_fee_source,
            term.projected_management_fee_amount
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
       GREATEST(projected.projected_amount-paid.verified_paid_amount,0)::bigint
         AS remaining_amount,
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

CREATE OR REPLACE FUNCTION validate_owner_sponsored_policy_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  amendment RECORD;
  source_term RECORD;
BEGIN
  SELECT previous_snapshot,corrected_snapshot,created_by_user_id
    INTO amendment FROM lease_data_corrections
   WHERE id=NEW.correction_id AND property_id=NEW.property_id AND lease_id=NEW.lease_id;
  IF NOT FOUND OR amendment.created_by_user_id<>NEW.created_by_user_id
     OR amendment.previous_snapshot->'ownerSponsorship' IS DISTINCT FROM NEW.previous_policy
     OR amendment.corrected_snapshot->'ownerSponsorship' IS DISTINCT FROM NEW.corrected_policy THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_POLICY_REVISION_AMENDMENT_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  SELECT term.*,lease.commercial_mode INTO source_term
    FROM owner_sponsored_lease_terms term
    JOIN leases lease ON lease.id=term.lease_id AND lease.property_id=term.property_id
   WHERE term.id=NEW.term_id AND term.property_id=NEW.property_id AND term.lease_id=NEW.lease_id
   FOR UPDATE OF term;
  IF NOT FOUND OR source_term.term_status<>'active' OR source_term.commercial_mode<>'owner_sponsored'
     OR NEW.previous_policy->>'ownerProfileId' IS DISTINCT FROM source_term.owner_profile_id::text
     OR NEW.previous_policy->>'ownershipKind' IS DISTINCT FROM source_term.ownership_kind
     OR NEW.previous_policy->>'ownershipAssignmentId' IS DISTINCT FROM source_term.ownership_assignment_id::text
     OR NEW.previous_policy->>'managementFeeMode' IS DISTINCT FROM source_term.management_fee_mode
     OR NEW.previous_policy->>'managementFeePayer' IS DISTINCT FROM source_term.management_fee_payer
     OR NEW.previous_policy->>'managementFeePayerName' IS DISTINCT FROM source_term.management_fee_payer_name
     OR NEW.previous_policy->>'sponsorshipReason' IS DISTINCT FROM source_term.sponsorship_reason
     OR COALESCE(NEW.previous_policy->>'managementFeeSource','property_policy')
          IS DISTINCT FROM source_term.management_fee_source
     OR NEW.previous_policy->>'managementFeeAgreementNote'
          IS DISTINCT FROM source_term.management_fee_agreement_note
     OR NEW.previous_policy->>'monthlyManagementFee' IS DISTINCT FROM source_term.snapshot_monthly_management_fee::text
     OR NEW.previous_policy->>'roomId' IS DISTINCT FROM source_term.room_id::text THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_POLICY_REVISION_SOURCE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN owner_sponsored_lease_terms.management_fee_source IS
  'property_policy preserves legacy effective-dated calculation; negotiated_snapshot freezes a per-lease agreement.';
COMMENT ON COLUMN owner_sponsored_lease_terms.management_fee_agreement_note IS
  'Admin-only negotiated management-fee agreement note. Never expose in owner portal.';

COMMIT;
