-- Owner asset registration is permanent for operational sponsorship.
-- Legacy effective dates remain audit provenance and must not reject a valid
-- active Owner-sponsored occupancy.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.owner_sponsored_lease_terms') IS NULL
     OR to_regclass('public.building_owner_assignments') IS NULL
     OR to_regclass('public.room_owner_assignments') IS NULL THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_PERMANENT_ASSIGNMENT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_owner_sponsored_lease_term()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lease_scope RECORD;
  assignment_scope RECORD;
BEGIN
  SELECT property_id,resident_id,room_id,onboarding_commitment_id,commercial_mode
    INTO lease_scope
    FROM leases WHERE id=NEW.lease_id;
  IF lease_scope.property_id IS NULL
     OR lease_scope.property_id<>NEW.property_id
     OR lease_scope.resident_id<>NEW.resident_id
     OR lease_scope.room_id<>NEW.room_id
     OR lease_scope.onboarding_commitment_id<>NEW.onboarding_commitment_id
     OR lease_scope.commercial_mode<>'owner_sponsored' THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_LEASE_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;

  IF NEW.ownership_kind='building' THEN
    SELECT assignment.property_id,assignment.owner_profile_id,room.id AS room_id
      INTO assignment_scope
      FROM building_owner_assignments assignment
      JOIN rooms room ON room.building_id=assignment.building_id
     WHERE assignment.id=NEW.ownership_assignment_id
       AND assignment.assignment_status='active'
       AND room.id=NEW.room_id;
  ELSE
    SELECT assignment.property_id,assignment.owner_profile_id,assignment.room_id
      INTO assignment_scope
      FROM room_owner_assignments assignment
     WHERE assignment.id=NEW.ownership_assignment_id
       AND assignment.assignment_status='active';
  END IF;
  IF assignment_scope.property_id IS NULL
     OR assignment_scope.property_id<>NEW.property_id
     OR assignment_scope.owner_profile_id<>NEW.owner_profile_id
     OR assignment_scope.room_id<>NEW.room_id THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_ASSIGNMENT_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
