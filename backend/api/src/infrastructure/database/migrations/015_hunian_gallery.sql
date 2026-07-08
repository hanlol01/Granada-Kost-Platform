ALTER TABLE files
  DROP CONSTRAINT IF EXISTS files_purpose_check;

ALTER TABLE files
  ADD CONSTRAINT files_purpose_check CHECK (
    file_purpose IN (
      'payment_proof',
      'complaint_attachment',
      'maintenance_attachment',
      'vehicle_photo',
      'vehicle_document',
      'room_photo',
      'property_logo',
      'hunian_gallery',
      'ktp'
    )
  );

ALTER TABLE files
  DROP CONSTRAINT IF EXISTS files_mime_type_check;

ALTER TABLE files
  ADD CONSTRAINT files_mime_type_check CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  );

ALTER TABLE files
  DROP CONSTRAINT IF EXISTS files_extension_check;

ALTER TABLE files
  ADD CONSTRAINT files_extension_check CHECK (
    file_extension IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
  );

CREATE TABLE IF NOT EXISTS hunian_gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  catalog_slug TEXT NOT NULL,
  public_group_key TEXT NOT NULL,
  category TEXT NOT NULL,
  gender TEXT NOT NULL,
  building_code TEXT,
  floor_code TEXT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  alt_text TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  public_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hunian_gallery_category_check CHECK (category IN ('rukost', 'apartkost')),
  CONSTRAINT hunian_gallery_gender_check CHECK (gender IN ('male', 'female')),
  CONSTRAINT hunian_gallery_floor_code_check CHECK (floor_code IS NULL OR floor_code IN ('A', 'B')),
  CONSTRAINT hunian_gallery_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT hunian_gallery_alt_text_check CHECK (length(trim(alt_text)) BETWEEN 1 AND 180),
  CONSTRAINT hunian_gallery_caption_check CHECK (caption IS NULL OR length(caption) <= 240)
);

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_property_catalog
  ON hunian_gallery_images(property_id, catalog_slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_property_group
  ON hunian_gallery_images(property_id, public_group_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_property_visible
  ON hunian_gallery_images(property_id, public_visible)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_catalog_visible
  ON hunian_gallery_images(property_id, catalog_slug, public_visible)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_file
  ON hunian_gallery_images(file_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_unique_active_file
  ON hunian_gallery_images(property_id, catalog_slug, file_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_single_cover
  ON hunian_gallery_images(property_id, catalog_slug)
  WHERE is_cover = true AND deleted_at IS NULL;
