-- Selected uploaded bytes only. All lease, transaction, attachment and audit text remains.
BEGIN;
CREATE TABLE lease_file_purge_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), archive_id UUID NOT NULL,
  property_id UUID NOT NULL, lease_id UUID NOT NULL,
  command_fingerprint TEXT NOT NULL CHECK(command_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
  review_fingerprint TEXT NOT NULL CHECK(review_fingerprint ~ '^[a-f0-9]{64}$'),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(char_length(trim(reason)) BETWEEN 3 AND 1000),
  selected_file_ids UUID[] NOT NULL CHECK(cardinality(selected_file_ids) BETWEEN 1 AND 100),
  previous_snapshot JSONB NOT NULL CHECK(jsonb_typeof(previous_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_file_purge_command_archive_fk FOREIGN KEY(archive_id,property_id,lease_id)
    REFERENCES lease_archives(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_file_purge_command_scope_unique UNIQUE(id,property_id,lease_id),
  CONSTRAINT lease_file_purge_command_property_unique UNIQUE(id,property_id),
  CONSTRAINT lease_file_purge_command_intent_unique UNIQUE(property_id,command_fingerprint)
);
CREATE TRIGGER trg_lease_file_purge_command_immutable BEFORE UPDATE OR DELETE ON lease_file_purge_commands
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

-- A permanent, unique file claim. Even an uncertain/failed deletion cannot be reassigned.
CREATE TABLE lease_file_purge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), command_id UUID NOT NULL,
  property_id UUID NOT NULL, lease_id UUID NOT NULL, file_id UUID NOT NULL UNIQUE,
  file_snapshot JSONB NOT NULL CHECK(jsonb_typeof(file_snapshot)='object'),
  status TEXT NOT NULL DEFAULT 'retry_pending' CHECK(status IN ('retry_pending','failed','deleted')),
  last_attempt_id UUID, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
  freed_bytes BIGINT NOT NULL DEFAULT 0 CHECK(freed_bytes>=0),
  verified_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_file_purge_item_command_fk FOREIGN KEY(command_id,property_id,lease_id)
    REFERENCES lease_file_purge_commands(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_file_purge_item_file_fk FOREIGN KEY(file_id,property_id) REFERENCES files(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_file_purge_item_scope_unique UNIQUE(id,command_id,property_id,file_id),
  CONSTRAINT lease_file_purge_item_result_check CHECK(
    (status='deleted' AND verified_deleted_at IS NOT NULL AND last_attempt_id IS NOT NULL)
    OR (status<>'deleted' AND verified_deleted_at IS NULL AND freed_bytes=0))
);
CREATE TABLE lease_file_purge_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), item_id UUID NOT NULL, command_id UUID NOT NULL,
  property_id UUID NOT NULL, file_id UUID NOT NULL,
  sequence_number INTEGER NOT NULL CHECK(sequence_number>0),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('retry_pending','failed','deleted')),
  result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
  freed_bytes BIGINT NOT NULL CHECK(freed_bytes>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_file_purge_attempt_item_fk FOREIGN KEY(item_id,command_id,property_id,file_id)
    REFERENCES lease_file_purge_items(id,command_id,property_id,file_id) ON DELETE RESTRICT,
  CONSTRAINT lease_file_purge_attempt_sequence_unique UNIQUE(item_id,sequence_number),
  CONSTRAINT lease_file_purge_attempt_scope_unique UNIQUE(id,item_id,command_id,property_id,file_id),
  CONSTRAINT lease_file_purge_attempt_result_check CHECK(
    (status='deleted' AND result->>'state'='deleted' AND result->>'verifiedAbsent'='true'
      AND result ?& ARRAY['state','verifiedAbsent','freedBytes'] AND (result->>'freedBytes')::bigint=freed_bytes)
    OR (status<>'deleted' AND result->>'state'=status AND freed_bytes=0
      AND result ?& ARRAY['state','code','availability']))
);
CREATE TRIGGER trg_lease_file_purge_attempt_immutable BEFORE UPDATE OR DELETE ON lease_file_purge_attempts
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();
ALTER TABLE lease_file_purge_items ADD CONSTRAINT lease_file_purge_item_attempt_fk
  FOREIGN KEY(last_attempt_id,id,command_id,property_id,file_id)
  REFERENCES lease_file_purge_attempts(id,item_id,command_id,property_id,file_id) ON DELETE RESTRICT;
ALTER TABLE files ADD COLUMN archive_purge_command_id UUID;
ALTER TABLE files ADD CONSTRAINT files_archive_purge_command_fk FOREIGN KEY(archive_purge_command_id,property_id)
  REFERENCES lease_file_purge_commands(id,property_id) ON DELETE RESTRICT;
CREATE FUNCTION guard_lease_file_purge_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt lease_file_purge_attempts%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'LEASE_FILE_PURGE_CLAIM_IMMUTABLE' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'retry_pending' OR NEW.attempt_count<>0 OR NEW.last_attempt_id IS NOT NULL
      OR NEW.freed_bytes<>0 OR NEW.verified_deleted_at IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM lease_file_purge_commands command JOIN lease_archives archive ON archive.id=command.archive_id
        JOIN leases lease ON lease.id=command.lease_id AND lease.property_id=command.property_id
        WHERE command.id=NEW.command_id AND command.property_id=NEW.property_id AND command.lease_id=NEW.lease_id
          AND NEW.file_id=ANY(command.selected_file_ids) AND archive.archive_status IN ('archived','superseded') AND lease.lease_status='cancelled') THEN
      RAISE EXCEPTION 'LEASE_FILE_PURGE_CLAIM_INVALID' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.command_id,NEW.property_id,NEW.lease_id,NEW.file_id,NEW.file_snapshot,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.command_id,OLD.property_id,OLD.lease_id,OLD.file_id,OLD.file_snapshot,OLD.created_at)
    OR OLD.status='deleted' OR NEW.attempt_count<>OLD.attempt_count+1 THEN
    RAISE EXCEPTION 'LEASE_FILE_PURGE_CLAIM_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO attempt FROM lease_file_purge_attempts WHERE id=NEW.last_attempt_id AND item_id=NEW.id
    AND command_id=NEW.command_id AND property_id=NEW.property_id AND file_id=NEW.file_id;
  IF NOT FOUND OR attempt.sequence_number<>NEW.attempt_count OR attempt.status<>NEW.status
    OR attempt.freed_bytes<>NEW.freed_bytes OR attempt.freed_bytes>(NEW.file_snapshot->>'sizeBytes')::bigint
    OR NEW.status='deleted' AND NEW.verified_deleted_at IS DISTINCT FROM attempt.created_at THEN
    RAISE EXCEPTION 'LEASE_FILE_PURGE_RESULT_AUTHORITY_INVALID' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lease_file_purge_item_validate BEFORE INSERT OR UPDATE OR DELETE ON lease_file_purge_items
  FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_projection();

CREATE FUNCTION guard_claimed_lease_file() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.archive_purge_command_id IS NOT NULL THEN RAISE EXCEPTION 'LEASE_FILE_PURGE_CLAIM_IMMUTABLE' USING ERRCODE='check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.archive_purge_command_id IS NOT NULL THEN
    IF NEW.archive_purge_command_id IS DISTINCT FROM OLD.archive_purge_command_id
      OR (to_jsonb(NEW)-ARRAY['is_deleted','deleted_at','deleted_by_user_id','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_deleted','deleted_at','deleted_by_user_id','updated_at'])
      OR NOT NEW.is_deleted
      OR NOT EXISTS(SELECT 1 FROM lease_file_purge_items item JOIN lease_file_purge_attempts attempt
          ON attempt.item_id=item.id AND attempt.command_id=item.command_id AND attempt.property_id=item.property_id AND attempt.file_id=item.file_id
        WHERE item.command_id=OLD.archive_purge_command_id AND item.file_id=OLD.id AND item.property_id=OLD.property_id
          AND item.status<>'deleted' AND attempt.sequence_number=item.attempt_count+1 AND attempt.status='deleted' AND attempt.result->>'verifiedAbsent'='true'
          AND NEW.deleted_by_user_id=attempt.actor_user_id AND NEW.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'LEASE_FILE_PURGE_RESULT_AUTHORITY_INVALID' USING ERRCODE='check_violation';
    END IF;
  ELSIF NEW.archive_purge_command_id IS NOT NULL THEN
    IF (to_jsonb(NEW)-ARRAY['archive_purge_command_id','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['archive_purge_command_id','updated_at'])
      OR NOT EXISTS(SELECT 1 FROM lease_file_purge_items item WHERE item.command_id=NEW.archive_purge_command_id
        AND item.file_id=NEW.id AND item.property_id=NEW.property_id AND item.attempt_count=0) THEN
      RAISE EXCEPTION 'LEASE_FILE_PURGE_CLAIM_INVALID' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_files_archive_purge_guard BEFORE UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION guard_claimed_lease_file();

CREATE TABLE lease_file_reference_guards (
  table_name TEXT NOT NULL,column_name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('uuid','array','json')),
  trigger_name TEXT NOT NULL, PRIMARY KEY(table_name,column_name,kind)
);
CREATE FUNCTION guard_lease_file_purge_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE value JSONB; previous JSONB; target UUID; file_row files%ROWTYPE; ids UUID[];
BEGIN
  value:=to_jsonb(NEW)->TG_ARGV[0];
  IF value IS NULL OR value='null'::jsonb THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    previous:=to_jsonb(OLD)->TG_ARGV[0];
    IF value IS NOT DISTINCT FROM previous AND
      ROW(to_jsonb(NEW)->'property_id',to_jsonb(NEW)->'lease_id',to_jsonb(NEW)->'invoice_id',
        to_jsonb(NEW)->'payment_id',to_jsonb(NEW)->'payment_proof_id',to_jsonb(NEW)->'checkout_command_id')
        IS NOT DISTINCT FROM ROW(to_jsonb(OLD)->'property_id',to_jsonb(OLD)->'lease_id',to_jsonb(OLD)->'invoice_id',
        to_jsonb(OLD)->'payment_id',to_jsonb(OLD)->'payment_proof_id',to_jsonb(OLD)->'checkout_command_id') THEN RETURN NEW; END IF;
  END IF;
  SELECT array_agg(DISTINCT match[1]::uuid ORDER BY match[1]::uuid) INTO ids
    FROM regexp_matches(value::text,'([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})','g') match;
  FOREACH target IN ARRAY COALESCE(ids,'{}'::uuid[]) LOOP
    SELECT * INTO file_row FROM files WHERE id=target FOR UPDATE;
    IF FOUND AND (file_row.archive_purge_command_id IS NOT NULL OR file_row.is_deleted) THEN
      RAISE EXCEPTION 'LEASE_FILE_PURGE_ATTACHMENT_UNAVAILABLE' USING ERRCODE='check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- Parent rebinding can create a new user without changing an attachment's file_id.
CREATE FUNCTION guard_lease_file_purge_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; ids UUID[]; parent_id UUID; old_parent_id UUID;
BEGIN
  IF TG_OP='UPDATE' AND ROW(to_jsonb(NEW)->'property_id',to_jsonb(NEW)->'resident_id',to_jsonb(NEW)->'lease_id',
      to_jsonb(NEW)->'occupancy_id',to_jsonb(NEW)->'invoice_id',to_jsonb(NEW)->'payment_id',
      to_jsonb(NEW)->'materialized_onboarding_commitment_id') IS NOT DISTINCT FROM
    ROW(to_jsonb(OLD)->'property_id',to_jsonb(OLD)->'resident_id',to_jsonb(OLD)->'lease_id',
      to_jsonb(OLD)->'occupancy_id',to_jsonb(OLD)->'invoice_id',to_jsonb(OLD)->'payment_id',
      to_jsonb(OLD)->'materialized_onboarding_commitment_id') THEN RETURN NEW; END IF;
  parent_id:=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='payment_allocations' THEN 'payment_id' ELSE 'id' END)::uuid;
  IF TG_OP='UPDATE' THEN old_parent_id:=(to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='payment_allocations' THEN 'payment_id' ELSE 'id' END)::uuid; END IF;
  SELECT array_agg(DISTINCT file_id ORDER BY file_id) INTO ids FROM (
    SELECT evidence.file_id FROM payment_evidence_files evidence WHERE TG_TABLE_NAME IN ('payments','payment_allocations') AND evidence.payment_id IN (parent_id,old_parent_id)
    UNION ALL SELECT evidence.file_id FROM payment_proof_files evidence JOIN payment_proofs proof ON proof.id=evidence.payment_proof_id
      WHERE (TG_TABLE_NAME IN ('payments','payment_allocations') AND proof.payment_id IN (parent_id,old_parent_id))
        OR (TG_TABLE_NAME='payment_proofs' AND proof.id IN (parent_id,old_parent_id)) OR (TG_TABLE_NAME='invoices' AND proof.invoice_id IN (parent_id,old_parent_id))
    UNION ALL SELECT evidence.file_id FROM invoice_evidence_files evidence WHERE TG_TABLE_NAME='invoices' AND evidence.invoice_id IN (parent_id,old_parent_id)
    UNION ALL SELECT evidence.file_id FROM payment_evidence_files evidence JOIN payment_allocations allocation ON allocation.payment_id=evidence.payment_id
      WHERE TG_TABLE_NAME='invoices' AND allocation.invoice_id IN (parent_id,old_parent_id)
    UNION ALL SELECT unnest(commitment.payment_evidence_file_ids) FROM booking_lead_payment_commitments commitment
      WHERE TG_TABLE_NAME='onboarding_commitments' AND commitment.materialized_onboarding_commitment_id IN (parent_id,old_parent_id)
    UNION ALL SELECT unnest(refund.refund_evidence_file_ids) FROM booking_lead_payment_commitment_refunds refund
      JOIN booking_lead_payment_commitments commitment ON commitment.id=refund.commitment_id
      WHERE TG_TABLE_NAME='onboarding_commitments' AND commitment.materialized_onboarding_commitment_id IN (parent_id,old_parent_id)
  ) bindings;
  FOREACH target IN ARRAY COALESCE(ids,'{}'::uuid[]) LOOP
    PERFORM 1 FROM files WHERE id=target FOR UPDATE;
    IF EXISTS(SELECT 1 FROM files WHERE id=target AND archive_purge_command_id IS NOT NULL) THEN
      RAISE EXCEPTION 'LEASE_FILE_PURGE_ATTACHMENT_UNAVAILABLE' USING ERRCODE='check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_h08_file_parent_payments BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_parent();
CREATE TRIGGER trg_h08_file_parent_allocations BEFORE INSERT OR UPDATE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_parent();
CREATE TRIGGER trg_h08_file_parent_invoices BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_parent();
CREATE TRIGGER trg_h08_file_parent_proofs BEFORE INSERT OR UPDATE ON payment_proofs FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_parent();
CREATE TRIGGER trg_h08_file_parent_onboarding BEFORE INSERT OR UPDATE ON onboarding_commitments FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_parent();

DO $$ DECLARE column_row RECORD; name TEXT;
BEGIN
  FOR column_row IN
    SELECT DISTINCT relation.relname AS table_name,source.attname AS column_name,'uuid'::text AS kind
      FROM pg_constraint fk JOIN pg_class relation ON relation.oid=fk.conrelid
      CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) keys(source_key,target_key)
      JOIN pg_attribute source ON source.attrelid=fk.conrelid AND source.attnum=keys.source_key
      JOIN pg_attribute target ON target.attrelid=fk.confrelid AND target.attnum=keys.target_key
      WHERE fk.contype='f' AND fk.confrelid='files'::regclass AND target.attname='id' AND relation.relnamespace='public'::regnamespace
    UNION SELECT columns.table_name,columns.column_name,CASE WHEN udt_name='_uuid' THEN 'array' WHEN data_type IN ('json','jsonb') THEN 'json' ELSE 'uuid' END
      FROM information_schema.columns columns JOIN information_schema.tables tables
        ON tables.table_schema=columns.table_schema AND tables.table_name=columns.table_name AND tables.table_type='BASE TABLE'
      WHERE columns.table_schema='public'
        AND (data_type IN ('json','jsonb') OR udt_name IN ('uuid','_uuid') AND column_name ILIKE '%file%')
  LOOP
    IF column_row.table_name IN ('lease_file_purge_commands','lease_file_purge_items','lease_file_purge_attempts')
      OR column_row.kind='json' AND column_row.table_name IN (
        'audit_logs','auth_audit_logs','business_events','idempotency_keys','lease_history','occupancy_history','lease_data_corrections',
        'lease_archive_commands','lease_archive_restore_commands','lease_archive_successor_commands',
        'lease_checkout_commands','lease_transfer_commands','lease_renewal_commands','owner_sponsored_policy_revisions','lease_commercial_mode_revisions') THEN CONTINUE; END IF;
    name:='trg_h08_file_'||substr(md5(column_row.table_name||'.'||column_row.column_name||':'||column_row.kind),1,16);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION guard_lease_file_purge_reference(%L)',
      name,column_row.table_name,column_row.column_name);
    INSERT INTO lease_file_reference_guards(table_name,column_name,kind,trigger_name)
      VALUES(column_row.table_name,column_row.column_name,column_row.kind,name);
  END LOOP;
END $$;
CREATE TRIGGER trg_lease_file_reference_guards_immutable BEFORE UPDATE OR DELETE ON lease_file_reference_guards
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();
COMMIT;
