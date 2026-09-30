BEGIN;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (file_purpose IN (
  'payment_proof','complaint_attachment','maintenance_attachment','expense_proof',
  'vehicle_photo','vehicle_document','room_photo','property_logo','hunian_gallery',
  'ktp','profile_photo','owner_realization_evidence'
));
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_size_check;
ALTER TABLE files ADD CONSTRAINT files_size_check CHECK (
  file_size_bytes > 0 AND file_size_bytes <=
  CASE WHEN file_purpose='owner_realization_evidence' THEN 10485760 ELSE 5242880 END
);

ALTER TABLE property_owner_realization_transfers
  ADD COLUMN finance_confirmed_by TEXT,
  ADD COLUMN finance_confirmation_channel TEXT,
  ADD COLUMN finance_confirmed_at TIMESTAMPTZ,
  ADD COLUMN legacy_evidence_reason TEXT;

CREATE TABLE property_owner_realization_evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('transfer','correction','recovery_event')),
  entity_id UUID NOT NULL,
  file_id UUID NOT NULL UNIQUE REFERENCES files(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_owner_realization_evidence_entity
  ON property_owner_realization_evidence_files(property_id,entity_kind,entity_id);

CREATE TABLE property_owner_realization_recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  realization_id UUID NOT NULL REFERENCES property_owner_realizations(id) ON DELETE RESTRICT,
  correction_id UUID NOT NULL REFERENCES property_owner_realization_corrections(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  finance_reference TEXT,
  note TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_owner_realization_recovery_events
  ON property_owner_realization_recovery_events(property_id,correction_id,occurred_at);

COMMIT;
