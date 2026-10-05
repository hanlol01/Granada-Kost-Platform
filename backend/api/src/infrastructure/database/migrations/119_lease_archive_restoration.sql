-- Restore and successor linkage are separate immutable authorities. No backfill.
BEGIN;
ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
ALTER TABLE lease_history ADD CONSTRAINT lease_history_event_type_check CHECK (event_type IN (
  'created','updated','invoice_generated','deposit_collected','deposit_refunded','deposit_deducted','closed',
  'transferred_out','transferred_in','transfer_scheduled','transfer_cancelled','transfer_failed',
  'renewal_intent','renewal_approved','renewal_financial_prepared','renewal_activation_authorized','renewed_out','renewed_in','renewal_cancelled','renewal_failed',
  'checkout_notice_received','checkout_scheduled','checkout_handover_recorded','checkout_inspection_recorded','checkout_completed','checkout_cancelled',
  'checkout_notice_edited','checkout_approval_edited','checkout_revision_requested',
  'activated','activation_attention_required','check_in_confirmation_required','check_in_confirmed','lease_data_corrected',
  'archive_restored','archive_replaced','archive_successor_created'
));
ALTER TABLE lease_archives ADD CONSTRAINT lease_archive_scope_unique UNIQUE(id,property_id,lease_id);

CREATE TABLE lease_archive_restore_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  command_fingerprint TEXT NOT NULL CHECK(command_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(char_length(trim(reason)) BETWEEN 3 AND 1000),
  previous_snapshot JSONB NOT NULL CHECK(jsonb_typeof(previous_snapshot)='object'),
  result_snapshot JSONB NOT NULL CHECK(jsonb_typeof(result_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_archive_restore_scope_fk FOREIGN KEY(archive_id,property_id,lease_id)
    REFERENCES lease_archives(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_restore_scope_unique UNIQUE(id,archive_id,property_id,lease_id),
  CONSTRAINT lease_archive_restore_intent_unique UNIQUE(property_id,command_fingerprint),
  CONSTRAINT lease_archive_restore_once UNIQUE(archive_id),
  CONSTRAINT lease_archive_restore_result_check CHECK (
    (result_snapshot->>'archive_id') IS NOT DISTINCT FROM archive_id::text
    AND (result_snapshot->>'property_id') IS NOT DISTINCT FROM property_id::text
    AND (result_snapshot->>'lease_id') IS NOT DISTINCT FROM lease_id::text
    AND (result_snapshot->>'archive_status') IS NOT DISTINCT FROM 'restored'
    AND (result_snapshot->>'lease_status') IN ('awaiting_activation','active')
    AND (result_snapshot->>'room_status') IN ('reserved','awaiting_check_in')
    AND result_snapshot ?& ARRAY['archive_id','property_id','lease_id','archive_status','lease_status','room_status']
  )
);
CREATE TRIGGER trg_lease_archive_restore_immutable BEFORE UPDATE OR DELETE ON lease_archive_restore_commands
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

CREATE TABLE lease_archive_successor_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  successor_lease_id UUID NOT NULL,
  source_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  successor_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(char_length(trim(reason)) BETWEEN 3 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_archive_successor_source_fk FOREIGN KEY(archive_id,property_id,lease_id)
    REFERENCES lease_archives(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_successor_target_fk FOREIGN KEY(successor_lease_id,property_id)
    REFERENCES leases(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_archive_successor_command_scope_unique UNIQUE(id,archive_id,property_id,lease_id),
  CONSTRAINT lease_archive_successor_once UNIQUE(archive_id),
  CHECK(successor_lease_id<>lease_id)
);
CREATE TRIGGER trg_lease_archive_successor_immutable BEFORE UPDATE OR DELETE ON lease_archive_successor_commands
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();
CREATE FUNCTION validate_lease_archive_successor_command() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM lease_archives archive
    JOIN leases source ON source.id=archive.lease_id AND source.property_id=archive.property_id
    JOIN leases successor ON successor.id=NEW.successor_lease_id AND successor.property_id=archive.property_id
    WHERE archive.id=NEW.archive_id AND archive.property_id=NEW.property_id AND archive.lease_id=NEW.lease_id
      AND archive.archive_status='archived' AND source.lease_status='cancelled' AND source.occupancy_id IS NULL
      AND source.room_id=NEW.source_room_id AND successor.room_id=NEW.successor_room_id
      AND successor.resident_id=source.resident_id AND successor.lease_status='awaiting_activation' AND successor.occupancy_id IS NULL) THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_SUCCESSOR_COMMAND_SCOPE_INVALID' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lease_archive_successor_validate BEFORE INSERT ON lease_archive_successor_commands
  FOR EACH ROW EXECUTE FUNCTION validate_lease_archive_successor_command();

ALTER TABLE lease_archives ADD COLUMN restoration_command_id UUID;
ALTER TABLE lease_archives ADD COLUMN successor_command_id UUID;
ALTER TABLE lease_archives ADD CONSTRAINT lease_archive_restoration_authority_fk
  FOREIGN KEY(restoration_command_id,id,property_id,lease_id)
  REFERENCES lease_archive_restore_commands(id,archive_id,property_id,lease_id) ON DELETE RESTRICT;
ALTER TABLE lease_archives ADD CONSTRAINT lease_archive_successor_authority_fk
  FOREIGN KEY(successor_command_id,id,property_id,lease_id)
  REFERENCES lease_archive_successor_commands(id,archive_id,property_id,lease_id) ON DELETE RESTRICT;
ALTER TABLE lease_archives ADD CONSTRAINT lease_archive_authority_state_check CHECK (
  archive_status='archived' AND restoration_command_id IS NULL AND successor_command_id IS NULL
  OR archive_status='restored' AND restoration_command_id IS NOT NULL AND successor_command_id IS NULL
  OR archive_status='superseded' AND restoration_command_id IS NULL AND successor_command_id IS NOT NULL
);

CREATE OR REPLACE FUNCTION validate_lease_archive_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE command RECORD; source_lease RECORD; restore_command RECORD; successor_command RECORD;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_HISTORY_PROTECTED' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND ((NEW.id,NEW.property_id,NEW.lease_id,NEW.cancellation_command_id)
      IS DISTINCT FROM (OLD.id,OLD.property_id,OLD.lease_id,OLD.cancellation_command_id)
      OR OLD.archive_status<>'archived' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_SOURCE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  SELECT result_snapshot INTO command FROM lease_archive_commands
    WHERE id=NEW.cancellation_command_id AND lease_id=NEW.lease_id AND property_id=NEW.property_id;
  SELECT lease_status,occupancy_id,resident_id,room_id INTO source_lease FROM leases
    WHERE id=NEW.lease_id AND property_id=NEW.property_id FOR UPDATE;
  IF command.result_snapshot->>'id' IS DISTINCT FROM NEW.id::text OR command.result_snapshot IS NULL
    OR TG_OP='INSERT' AND (NEW.archive_status<>'archived' OR command.result_snapshot->>'financial_resolution_state' IS DISTINCT FROM NEW.financial_resolution_state)
    OR NEW.archive_status='archived' AND (source_lease.lease_status IS DISTINCT FROM 'cancelled' OR source_lease.occupancy_id IS NOT NULL) THEN
    RAISE EXCEPTION 'LEASE_ARCHIVE_COMMAND_SCOPE_INVALID' USING ERRCODE='check_violation';
  END IF;
  IF NEW.archive_status='restored' THEN
    SELECT result_snapshot,created_by_user_id INTO restore_command FROM lease_archive_restore_commands
      WHERE id=NEW.restoration_command_id AND archive_id=NEW.id AND property_id=NEW.property_id AND lease_id=NEW.lease_id;
    IF restore_command.result_snapshot IS NULL OR source_lease.occupancy_id IS NOT NULL
      OR source_lease.lease_status IS DISTINCT FROM restore_command.result_snapshot->>'lease_status'
      OR source_lease.room_id::text IS DISTINCT FROM restore_command.result_snapshot->>'room_id'
      OR NEW.restored_by_user_id IS DISTINCT FROM restore_command.created_by_user_id
      OR NEW.financial_resolution_state<>'not_required' THEN
      RAISE EXCEPTION 'LEASE_ARCHIVE_RESTORE_AUTHORITY_INVALID' USING ERRCODE='check_violation';
    END IF;
  ELSIF NEW.archive_status='superseded' THEN
    SELECT replacement.successor_lease_id,replacement.created_by_user_id,lease.resident_id INTO successor_command
      FROM lease_archive_successor_commands replacement JOIN leases lease ON lease.id=replacement.successor_lease_id AND lease.property_id=replacement.property_id
      WHERE replacement.id=NEW.successor_command_id AND replacement.archive_id=NEW.id
        AND replacement.property_id=NEW.property_id AND replacement.lease_id=NEW.lease_id;
    IF successor_command.successor_lease_id IS NULL OR NEW.successor_lease_id IS DISTINCT FROM successor_command.successor_lease_id
      OR source_lease.resident_id IS DISTINCT FROM successor_command.resident_id OR source_lease.lease_status<>'cancelled' THEN
      RAISE EXCEPTION 'LEASE_ARCHIVE_SUCCESSOR_AUTHORITY_INVALID' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
