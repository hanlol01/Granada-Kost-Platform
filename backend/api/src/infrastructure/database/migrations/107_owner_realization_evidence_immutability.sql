BEGIN;

CREATE OR REPLACE FUNCTION reject_owner_realization_evidence_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Owner realization evidence and recovery events are append-only';
END;
$$;

CREATE TRIGGER trg_owner_realization_evidence_immutable
BEFORE UPDATE OR DELETE ON property_owner_realization_evidence_files
FOR EACH ROW EXECUTE FUNCTION reject_owner_realization_evidence_mutation();

CREATE TRIGGER trg_owner_realization_recovery_event_immutable
BEFORE UPDATE OR DELETE ON property_owner_realization_recovery_events
FOR EACH ROW EXECUTE FUNCTION reject_owner_realization_evidence_mutation();

COMMIT;
