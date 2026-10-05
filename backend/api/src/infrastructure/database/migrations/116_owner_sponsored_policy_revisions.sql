-- Additive history for administrative corrections to recorded sponsorship facts.
-- Original onboarding inputs, financial transactions and issued documents remain unchanged.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS owner_sponsored_terms_id_property_lease_uq
  ON owner_sponsored_lease_terms(id,property_id,lease_id);

CREATE TABLE IF NOT EXISTS owner_sponsored_policy_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  term_id UUID NOT NULL,
  correction_id UUID NOT NULL UNIQUE,
  effective_from DATE NOT NULL,
  previous_policy JSONB NOT NULL,
  corrected_policy JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT owner_sponsored_policy_revision_term_fk
    FOREIGN KEY(term_id,property_id,lease_id)
    REFERENCES owner_sponsored_lease_terms(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT owner_sponsored_policy_revision_correction_fk
    FOREIGN KEY(correction_id,property_id,lease_id)
    REFERENCES lease_data_corrections(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT owner_sponsored_policy_revision_snapshot_check CHECK (
    jsonb_typeof(previous_policy)='object' AND jsonb_typeof(corrected_policy)='object'
    AND previous_policy ?& ARRAY['ownerProfileId','ownershipKind','ownershipAssignmentId',
      'managementFeeMode','managementFeePayer','managementFeePayerName','sponsorshipReason',
      'monthlyManagementFee','projectedManagementFeeAmount','roomId','startDate','endDate','termMonths']
    AND corrected_policy ?& ARRAY['ownerProfileId','ownershipKind','ownershipAssignmentId',
      'managementFeeMode','managementFeePayer','managementFeePayerName','sponsorshipReason',
      'monthlyManagementFee','projectedManagementFeeAmount','roomId','startDate','endDate','termMonths']
    AND previous_policy<>corrected_policy
    AND effective_from=(corrected_policy->>'startDate')::date
  )
);

CREATE INDEX IF NOT EXISTS idx_owner_sponsored_policy_revision_timeline
  ON owner_sponsored_policy_revisions(property_id,lease_id,created_at DESC,id DESC);

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
     OR NEW.previous_policy->>'monthlyManagementFee' IS DISTINCT FROM source_term.snapshot_monthly_management_fee::text
     OR NEW.previous_policy->>'roomId' IS DISTINCT FROM source_term.room_id::text THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_POLICY_REVISION_SOURCE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_sponsored_policy_revision_validate ON owner_sponsored_policy_revisions;
CREATE TRIGGER trg_owner_sponsored_policy_revision_validate
  BEFORE INSERT ON owner_sponsored_policy_revisions
  FOR EACH ROW EXECUTE FUNCTION validate_owner_sponsored_policy_revision();

DROP TRIGGER IF EXISTS trg_owner_sponsored_policy_revision_immutable ON owner_sponsored_policy_revisions;
CREATE TRIGGER trg_owner_sponsored_policy_revision_immutable
  BEFORE UPDATE OR DELETE ON owner_sponsored_policy_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

COMMIT;
