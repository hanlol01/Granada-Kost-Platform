BEGIN;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_purpose_check;
ALTER TABLE files ADD CONSTRAINT files_purpose_check CHECK (file_purpose IN (
  'payment_proof','complaint_attachment','maintenance_attachment','expense_proof',
  'vehicle_photo','vehicle_document','room_photo','property_logo','hunian_gallery',
  'ktp','profile_photo','owner_realization_evidence','document_signature'
));

CREATE TABLE IF NOT EXISTS organization_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  company_name TEXT NOT NULL DEFAULT 'KOSTATION',
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organization_settings (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS property_document_signatories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL CHECK (role_code IN ('manager', 'dbo', 'director')),
  full_name TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  signature_file_id UUID UNIQUE REFERENCES files(id) ON DELETE RESTRICT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_document_signatories_role_unique UNIQUE (property_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_property_document_signatories_property
  ON property_document_signatories(property_id, role_code);

COMMIT;
