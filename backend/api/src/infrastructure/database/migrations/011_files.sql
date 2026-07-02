CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  uploader_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  sanitized_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_purpose TEXT NOT NULL,
  storage_driver TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT files_purpose_check CHECK (
    file_purpose IN (
      'payment_proof',
      'complaint_attachment',
      'maintenance_attachment',
      'vehicle_photo',
      'vehicle_document',
      'room_photo',
      'property_logo',
      'ktp'
    )
  ),
  CONSTRAINT files_storage_driver_check CHECK (storage_driver IN ('local', 's3')),
  CONSTRAINT files_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  CONSTRAINT files_extension_check CHECK (file_extension IN ('jpg', 'jpeg', 'png', 'pdf')),
  CONSTRAINT files_size_check CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
  CONSTRAINT files_checksum_sha256_check CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT files_deleted_at_check CHECK (
    (is_deleted = false AND deleted_at IS NULL) OR
    (is_deleted = true AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT files_unique_storage_path UNIQUE (storage_driver, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_files_property_purpose_created
  ON files(property_id, file_purpose, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_files_uploader_created
  ON files(uploader_user_id, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_files_checksum
  ON files(checksum_sha256);

CREATE INDEX IF NOT EXISTS idx_files_soft_deleted
  ON files(deleted_at)
  WHERE is_deleted = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_proof_files_file_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM payment_proof_files ppf
    LEFT JOIN files f ON f.id = ppf.file_id
    WHERE f.id IS NULL
  ) THEN
    ALTER TABLE payment_proof_files
      ADD CONSTRAINT payment_proof_files_file_id_fkey
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'complaint_files_file_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM complaint_files cf
    LEFT JOIN files f ON f.id = cf.file_id
    WHERE f.id IS NULL
  ) THEN
    ALTER TABLE complaint_files
      ADD CONSTRAINT complaint_files_file_id_fkey
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_work_order_files_file_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM maintenance_work_order_files wof
    LEFT JOIN files f ON f.id = wof.file_id
    WHERE f.id IS NULL
  ) THEN
    ALTER TABLE maintenance_work_order_files
      ADD CONSTRAINT maintenance_work_order_files_file_id_fkey
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_files_file_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM vehicle_files vf
    LEFT JOIN files f ON f.id = vf.file_id
    WHERE f.id IS NULL
  ) THEN
    ALTER TABLE vehicle_files
      ADD CONSTRAINT vehicle_files_file_id_fkey
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_primary_photo_file_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM rooms r
    LEFT JOIN files f ON f.id = r.primary_photo_file_id
    WHERE r.primary_photo_file_id IS NOT NULL AND f.id IS NULL
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_primary_photo_file_id_fkey
      FOREIGN KEY (primary_photo_file_id) REFERENCES files(id) ON DELETE SET NULL;
  END IF;
END $$;
