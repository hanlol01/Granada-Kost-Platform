-- Additive Handoff 08 room-recording correction evidence. No lease, room,
-- occupancy, payment, invoice or issued-document rows are rewritten here.
BEGIN;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (file_purpose IN (
  'payment_proof','complaint_attachment','maintenance_attachment','expense_proof',
  'vehicle_photo','vehicle_document','room_photo','property_logo','hunian_gallery',
  'ktp','profile_photo','owner_realization_evidence','document_signature','lease_revision_evidence'
));

CREATE UNIQUE INDEX IF NOT EXISTS uq_files_id_property_revision ON files(id,property_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_data_corrections_identity_revision
  ON lease_data_corrections(id,property_id,lease_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leases_id_property_revision ON leases(id,property_id);

-- A unique row owns each private upload, independently of the transaction's
-- snapshot isolation. The same upload can support several amendments of its
-- owning lease, but two leases can never claim it concurrently.
CREATE TABLE IF NOT EXISTS lease_revision_file_bindings (
  file_id UUID PRIMARY KEY,
  property_id UUID NOT NULL,
  lease_id UUID NOT NULL,
  CONSTRAINT lease_revision_file_bindings_file_fk FOREIGN KEY(file_id,property_id)
    REFERENCES files(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_revision_file_bindings_lease_fk FOREIGN KEY(lease_id,property_id)
    REFERENCES leases(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_revision_file_bindings_scope_unique UNIQUE(file_id,property_id,lease_id)
);

CREATE TABLE IF NOT EXISTS lease_data_correction_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  correction_id UUID NOT NULL,
  file_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_data_correction_evidence_correction_fk
    FOREIGN KEY(correction_id,property_id,lease_id)
    REFERENCES lease_data_corrections(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_data_correction_evidence_file_fk
    FOREIGN KEY(file_id,property_id) REFERENCES files(id,property_id) ON DELETE RESTRICT,
  CONSTRAINT lease_data_correction_evidence_binding_fk
    FOREIGN KEY(file_id,property_id,lease_id)
    REFERENCES lease_revision_file_bindings(file_id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_data_correction_evidence_unique UNIQUE(correction_id,file_id)
);
CREATE INDEX IF NOT EXISTS idx_lease_data_correction_evidence_file
  ON lease_data_correction_evidence(file_id,lease_id);

CREATE OR REPLACE FUNCTION validate_lease_data_correction_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM files file WHERE file.id=NEW.file_id AND file.property_id=NEW.property_id
    AND file.file_purpose='lease_revision_evidence' AND NOT file.is_deleted
    AND file.file_size_bytes BETWEEN 1 AND 5242880
    AND file.mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEASE_CORRECTION_EVIDENCE_UNAVAILABLE' USING ERRCODE='check_violation';
  END IF;
  INSERT INTO lease_revision_file_bindings(file_id,property_id,lease_id)
    VALUES(NEW.file_id,NEW.property_id,NEW.lease_id)
    ON CONFLICT(file_id) DO UPDATE SET file_id=EXCLUDED.file_id
      WHERE lease_revision_file_bindings.property_id=EXCLUDED.property_id
        AND lease_revision_file_bindings.lease_id=EXCLUDED.lease_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEASE_CORRECTION_EVIDENCE_SHARED' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_lease_revision_file_binding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'LEASE_REVISION_FILE_BINDING_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  IF ROW(NEW.file_id,NEW.property_id,NEW.lease_id) IS DISTINCT FROM ROW(OLD.file_id,OLD.property_id,OLD.lease_id) THEN
    RAISE EXCEPTION 'LEASE_REVISION_FILE_BINDING_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lease_revision_file_binding_immutable ON lease_revision_file_bindings;
CREATE TRIGGER trg_lease_revision_file_binding_immutable
  BEFORE UPDATE OR DELETE ON lease_revision_file_bindings
  FOR EACH ROW EXECUTE FUNCTION guard_lease_revision_file_binding();

DROP TRIGGER IF EXISTS trg_lease_data_correction_evidence_validate ON lease_data_correction_evidence;
CREATE TRIGGER trg_lease_data_correction_evidence_validate
  BEFORE INSERT ON lease_data_correction_evidence
  FOR EACH ROW EXECUTE FUNCTION validate_lease_data_correction_evidence();

DROP TRIGGER IF EXISTS trg_lease_data_correction_evidence_append_only ON lease_data_correction_evidence;
CREATE TRIGGER trg_lease_data_correction_evidence_append_only
  BEFORE UPDATE OR DELETE ON lease_data_correction_evidence
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

COMMIT;
