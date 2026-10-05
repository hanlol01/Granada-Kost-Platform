-- Lease cancellation is an audited lifecycle command, not checkout or file deletion.
-- Additive only; no historical leases, payments, evidence or room states are changed.
BEGIN;

CREATE TABLE lease_archive_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  command_fingerprint TEXT NOT NULL CHECK (command_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  previous_snapshot JSONB NOT NULL CHECK (jsonb_typeof(previous_snapshot)='object'),
  result_snapshot JSONB NOT NULL CHECK (jsonb_typeof(result_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_archive_command_lease_scope_fk FOREIGN KEY(lease_id,property_id)
    REFERENCES leases(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_command_scope_unique UNIQUE(id,property_id,lease_id),
  CONSTRAINT lease_archive_command_intent_unique UNIQUE(property_id,command_fingerprint),
  CONSTRAINT lease_archive_command_snapshot_check CHECK (
    (previous_snapshot #>> '{context,lease,id}') IS NOT DISTINCT FROM lease_id::text
    AND (previous_snapshot #>> '{context,lease,property_id}') IS NOT DISTINCT FROM property_id::text
    AND (result_snapshot->>'lease_id') IS NOT DISTINCT FROM lease_id::text
    AND (result_snapshot->>'property_id') IS NOT DISTINCT FROM property_id::text
    AND (result_snapshot->>'archive_status') IS NOT DISTINCT FROM 'archived'
    AND (result_snapshot->>'room_status') IS NOT DISTINCT FROM 'vacant'
    AND (result_snapshot->>'financial_resolution_state') IN ('not_required','pending_review')
    AND previous_snapshot #> '{context,lease}' IS NOT NULL
    AND result_snapshot ?& ARRAY['lease_id','property_id','archive_status','room_status','financial_resolution_state','id']
  )
);
CREATE TRIGGER trg_lease_archive_command_immutable BEFORE UPDATE OR DELETE ON lease_archive_commands
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

CREATE TABLE lease_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  cancellation_command_id UUID NOT NULL UNIQUE,
  archive_status TEXT NOT NULL DEFAULT 'archived' CHECK (archive_status IN ('archived','restored','superseded')),
  financial_resolution_state TEXT NOT NULL CHECK (financial_resolution_state IN ('not_required','pending_review','resolved')),
  restored_at TIMESTAMPTZ,
  restored_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  successor_lease_id UUID,
  CONSTRAINT lease_archive_source_command_fk FOREIGN KEY(cancellation_command_id,property_id,lease_id)
    REFERENCES lease_archive_commands(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_successor_scope_fk FOREIGN KEY(successor_lease_id,property_id)
    REFERENCES leases(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_lifecycle_check CHECK (
    archive_status='archived' AND restored_at IS NULL AND restored_by_user_id IS NULL AND successor_lease_id IS NULL
    OR archive_status='restored' AND restored_at IS NOT NULL AND restored_by_user_id IS NOT NULL AND successor_lease_id IS NULL
    OR archive_status='superseded' AND successor_lease_id IS NOT NULL AND successor_lease_id<>lease_id
  )
);
CREATE UNIQUE INDEX uq_lease_archives_current ON lease_archives(lease_id) WHERE archive_status='archived';
CREATE INDEX idx_lease_archives_workspace ON lease_archives(property_id,archive_status,financial_resolution_state);

CREATE FUNCTION validate_lease_archive_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE command RECORD; source_lease RECORD;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_HISTORY_PROTECTED' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.property_id,NEW.lease_id,NEW.cancellation_command_id)
      IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.lease_id,OLD.cancellation_command_id) THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_SOURCE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  SELECT result_snapshot INTO command FROM lease_archive_commands
    WHERE id=NEW.cancellation_command_id AND lease_id=NEW.lease_id AND property_id=NEW.property_id;
  SELECT lease_status,occupancy_id INTO source_lease FROM leases WHERE id=NEW.lease_id AND property_id=NEW.property_id FOR UPDATE;
  IF command.result_snapshot->>'id' IS DISTINCT FROM NEW.id::text OR command.result_snapshot IS NULL
    OR TG_OP='INSERT' AND command.result_snapshot->>'financial_resolution_state' IS DISTINCT FROM NEW.financial_resolution_state
    OR NEW.archive_status='archived' AND (source_lease.lease_status IS DISTINCT FROM 'cancelled' OR source_lease.occupancy_id IS NOT NULL) THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_COMMAND_SCOPE_INVALID' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lease_archive_projection_validate BEFORE INSERT OR UPDATE OR DELETE ON lease_archives
  FOR EACH ROW EXECUTE FUNCTION validate_lease_archive_projection();

COMMENT ON TABLE lease_archives IS 'Mistaken lease archive projection. Actual occupancy uses checkout; no transaction facts or upload bytes are deleted.';
COMMIT;
