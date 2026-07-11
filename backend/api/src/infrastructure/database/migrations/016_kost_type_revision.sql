-- Admin UX M2 master-data migration.
--
-- The migration runner executes every SQL file on every invocation.  Keep this
-- file forward-only, additive, and replay-safe.  The guarded backfill below
-- intentionally aborts instead of selecting a "best" legacy value.

BEGIN;

-- Fail closed before creating a new source of truth.  M0 remediation is the
-- only approved source for resolving these facts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM rooms r
    LEFT JOIN room_buildings b ON b.id = r.building_id
    WHERE r.room_status <> 'inactive'
      AND (
        r.category IS NULL
        OR r.category NOT IN ('rukost', 'apartkost')
        OR (r.building_id IS NOT NULL AND (
          b.id IS NULL
          OR b.property_id <> r.property_id
          OR b.category <> r.category
        ))
      )
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_ROOM_CATEGORY_OR_BUILDING_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rooms r
    WHERE r.room_status <> 'inactive'
      AND r.category IN ('rukost', 'apartkost')
    GROUP BY r.property_id, r.category
    HAVING COUNT(DISTINCT r.monthly_price) > 1
       OR COUNT(DISTINCT r.deposit_amount) > 1
       OR COUNT(DISTINCT r.yearly_price) > 1
       OR (BOOL_OR(r.yearly_price IS NULL) AND BOOL_OR(r.yearly_price IS NOT NULL))
       OR COUNT(DISTINCT r.size_label) > 1
       OR (BOOL_OR(r.size_label IS NULL) AND BOOL_OR(r.size_label IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_KOST_TYPE_FACTS_NOT_UNIFORM'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM room_facility_assignments assignment
    JOIN rooms r ON r.id = assignment.room_id
    JOIN room_facilities facility ON facility.id = assignment.facility_id
    WHERE r.property_id <> facility.property_id
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_FACILITY_PROPERTY_MISMATCH'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH room_sets AS (
      SELECT
        r.id,
        r.property_id,
        r.category,
        COALESCE(
          array_agg(assignment.facility_id ORDER BY assignment.facility_id)
            FILTER (WHERE assignment.facility_id IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS facility_ids
      FROM rooms r
      LEFT JOIN room_facility_assignments assignment ON assignment.room_id = r.id
      WHERE r.room_status <> 'inactive'
        AND r.category IN ('rukost', 'apartkost')
      GROUP BY r.id, r.property_id, r.category
    )
    SELECT 1
    FROM room_sets
    GROUP BY property_id, category
    HAVING COUNT(DISTINCT array_to_string(facility_ids, ',')) > 1
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_FACILITY_SET_NOT_UNIFORM'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM occupancies occupancy
    JOIN rooms room ON room.id = occupancy.room_id
    JOIN residents resident ON resident.id = occupancy.resident_id
    WHERE occupancy.occupancy_status = 'active'
      AND (
        occupancy.property_id <> room.property_id
        OR occupancy.property_id <> resident.property_id
        OR room.room_status <> 'occupied'
      )
  ) OR EXISTS (
    SELECT 1
    FROM rooms room
    WHERE room.room_status = 'occupied'
      AND NOT EXISTS (
        SELECT 1
        FROM occupancies occupancy
        WHERE occupancy.room_id = room.id
          AND occupancy.occupancy_status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_ACTIVE_OCCUPANCY_INVARIANT_FAILED'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kost_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description_short TEXT,
  description_long TEXT,
  room_size_label TEXT,
  room_size_m2 NUMERIC(6,2),
  monthly_price BIGINT NOT NULL,
  yearly_price BIGINT NOT NULL DEFAULT 0,
  deposit_amount BIGINT NOT NULL DEFAULT 0,
  max_occupants SMALLINT NOT NULL DEFAULT 1,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_types_category_check CHECK (category IN ('rukost', 'apartkost')),
  CONSTRAINT kost_types_price_check CHECK (
    monthly_price >= 0 AND yearly_price >= 0 AND deposit_amount >= 0
  ),
  CONSTRAINT kost_types_single_occupant_check CHECK (max_occupants = 1),
  CONSTRAINT kost_types_room_size_check CHECK (room_size_m2 IS NULL OR room_size_m2 > 0),
  CONSTRAINT kost_types_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT kost_types_unique_slug UNIQUE (property_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kost_types_one_active_category
  ON kost_types(property_id, category)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kost_types_property_status_deleted
  ON kost_types(property_id, status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_kost_types_property_category
  ON kost_types(property_id, category);

CREATE TABLE IF NOT EXISTS facility_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_categories_unique_name UNIQUE (property_id, name),
  CONSTRAINT facility_categories_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_facility_categories_property_sort
  ON facility_categories(property_id, sort_order, name);

ALTER TABLE room_facilities
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES facility_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_facilities_sort_order_check'
      AND conrelid = 'room_facilities'::regclass
  ) THEN
    ALTER TABLE room_facilities
      ADD CONSTRAINT room_facilities_sort_order_check CHECK (sort_order >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_room_facilities_property_category_status_sort
  ON room_facilities(property_id, category_id, status, sort_order);

CREATE TABLE IF NOT EXISTS kost_type_facility_assignments (
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES room_facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kost_type_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_kost_type_facility_assignments_facility
  ON kost_type_facility_assignments(facility_id);

CREATE TABLE IF NOT EXISTS kost_type_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kost_type_id UUID REFERENCES kost_types(id) ON DELETE CASCADE,
  rule_category TEXT NOT NULL,
  icon TEXT,
  rule_text TEXT NOT NULL,
  is_allowed BOOLEAN,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_type_rules_category_check CHECK (
    rule_category IN ('general', 'guest', 'resident', 'other', 'special_notes')
  ),
  CONSTRAINT kost_type_rules_text_check CHECK (length(trim(rule_text)) > 0),
  CONSTRAINT kost_type_rules_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_kost_type_rules_property_target_sort
  ON kost_type_rules(property_id, kost_type_id, sort_order);

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS kost_type_id UUID REFERENCES kost_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_rooms_property_kost_type_status
  ON rooms(property_id, kost_type_id, room_status);

-- The distinct CTE does not choose a mode/minimum/maximum.  The preflight
-- above has already proved that each populated group has exactly one fact.
WITH category_facts AS (
  SELECT DISTINCT
    property_id,
    category,
    monthly_price::bigint AS monthly_price,
    COALESCE(yearly_price, 0)::bigint AS yearly_price,
    deposit_amount::bigint AS deposit_amount,
    size_label AS room_size_label
  FROM rooms
  WHERE room_status <> 'inactive'
    AND category IN ('rukost', 'apartkost')
), categories(category, name) AS (
  VALUES
    ('rukost'::text, 'Rumah Kost'::text),
    ('apartkost'::text, 'Apart Kost'::text)
)
INSERT INTO kost_types (
  property_id, category, name, slug, room_size_label,
  monthly_price, yearly_price, deposit_amount,
  status, public_visible
)
SELECT
  property.id,
  categories.category,
  categories.name,
  categories.category,
  facts.room_size_label,
  COALESCE(facts.monthly_price, 0),
  COALESCE(facts.yearly_price, 0),
  COALESCE(facts.deposit_amount, 0),
  'active',
  true
FROM properties property
CROSS JOIN categories
LEFT JOIN category_facts facts
  ON facts.property_id = property.id
 AND facts.category = categories.category
WHERE property.status = 'active'
ON CONFLICT (property_id, slug) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM properties property
    CROSS JOIN (VALUES ('rukost'::text), ('apartkost'::text)) category(category)
    WHERE property.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM kost_types kost_type
        WHERE kost_type.property_id = property.id
          AND kost_type.category = category.category
          AND kost_type.status = 'active'
          AND kost_type.deleted_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_ACTIVE_KOST_TYPE_MISSING'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rooms room
    JOIN kost_types kost_type ON kost_type.id = room.kost_type_id
    WHERE kost_type.monthly_price > 2147483647
       OR kost_type.yearly_price > 2147483647
       OR kost_type.deposit_amount > 2147483647
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_LEGACY_ROOM_PRICE_OVERFLOW'
      USING ERRCODE = 'numeric_value_out_of_range';
  END IF;
END $$;

UPDATE rooms room
SET kost_type_id = kost_type.id
FROM kost_types kost_type
WHERE room.property_id = kost_type.property_id
  AND room.category = kost_type.category
  AND room.category IN ('rukost', 'apartkost')
  AND kost_type.status = 'active'
  AND kost_type.deleted_at IS NULL
  AND room.kost_type_id IS DISTINCT FROM kost_type.id;

-- kost_types is the source of truth.  This update is deliberately replay-safe:
-- it only changes stale legacy snapshots, never invoice snapshots.
UPDATE rooms room
SET monthly_price = kost_type.monthly_price::integer,
    yearly_price = kost_type.yearly_price::integer,
    deposit_amount = kost_type.deposit_amount::integer,
    updated_at = CASE
      WHEN room.monthly_price IS DISTINCT FROM kost_type.monthly_price::integer
        OR room.yearly_price IS DISTINCT FROM kost_type.yearly_price::integer
        OR room.deposit_amount IS DISTINCT FROM kost_type.deposit_amount::integer
      THEN now()
      ELSE room.updated_at
    END
FROM kost_types kost_type
WHERE room.kost_type_id = kost_type.id
  AND (
    room.monthly_price IS DISTINCT FROM kost_type.monthly_price::integer
    OR room.yearly_price IS DISTINCT FROM kost_type.yearly_price::integer
    OR room.deposit_amount IS DISTINCT FROM kost_type.deposit_amount::integer
  );

-- Populate a target only once from proven-identical room assignments.  A later
-- operational mutation is authoritative and must not be overwritten on replay.
INSERT INTO kost_type_facility_assignments (kost_type_id, facility_id)
SELECT DISTINCT room.kost_type_id, assignment.facility_id
FROM rooms room
JOIN room_facility_assignments assignment ON assignment.room_id = room.id
WHERE room.kost_type_id IS NOT NULL
  AND room.room_status <> 'inactive'
  AND NOT EXISTS (
    SELECT 1
    FROM kost_type_facility_assignments existing
    WHERE existing.kost_type_id = room.kost_type_id
  )
ON CONFLICT (kost_type_id, facility_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rooms_noninactive_kost_type_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_noninactive_kost_type_check
      CHECK (room_status = 'inactive' OR kost_type_id IS NOT NULL) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rooms
    WHERE room_status <> 'inactive' AND kost_type_id IS NULL
  ) THEN
    RAISE EXCEPTION 'M2_PREFLIGHT_ROOM_KOST_TYPE_BACKFILL_INCOMPLETE'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_noninactive_kost_type_check'
      AND conrelid = 'rooms'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE rooms VALIDATE CONSTRAINT rooms_noninactive_kost_type_check;
  END IF;
END $$;

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
      'ktp',
      'profile_photo'
    )
  );

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS ktp_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_photo_file_id UUID REFERENCES files(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'residents_ktp_number_format_check'
      AND conrelid = 'residents'::regclass
  ) THEN
    ALTER TABLE residents
      ADD CONSTRAINT residents_ktp_number_format_check
      CHECK (ktp_number IS NULL OR ktp_number ~ '^[0-9]{16}$') NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_residents_property_status_name
  ON residents(property_id, resident_status, full_name);

CREATE INDEX IF NOT EXISTS idx_residents_ktp_file
  ON residents(ktp_file_id)
  WHERE ktp_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_residents_profile_photo_file
  ON residents(profile_photo_file_id)
  WHERE profile_photo_file_id IS NOT NULL;

ALTER TABLE hunian_gallery_images
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS kost_type_id UUID REFERENCES kost_types(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS common_area_key TEXT;

ALTER TABLE hunian_gallery_images
  ALTER COLUMN catalog_slug DROP NOT NULL,
  ALTER COLUMN public_group_key DROP NOT NULL,
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL;

ALTER TABLE hunian_gallery_images
  DROP CONSTRAINT IF EXISTS hunian_gallery_category_check,
  DROP CONSTRAINT IF EXISTS hunian_gallery_gender_check,
  DROP CONSTRAINT IF EXISTS hunian_gallery_target_check;

ALTER TABLE hunian_gallery_images
  ADD CONSTRAINT hunian_gallery_category_check CHECK (
    category IS NULL OR category IN ('rukost', 'apartkost')
  );

ALTER TABLE hunian_gallery_images
  ADD CONSTRAINT hunian_gallery_gender_check CHECK (
    gender IS NULL OR gender IN ('male', 'female')
  );

ALTER TABLE hunian_gallery_images
  ADD CONSTRAINT hunian_gallery_target_check CHECK (
    (
      target_type IS NULL
      AND kost_type_id IS NULL
      AND common_area_key IS NULL
      AND catalog_slug IS NOT NULL
      AND public_group_key IS NOT NULL
      AND category IS NOT NULL
      AND gender IS NOT NULL
    )
    OR (
      target_type = 'kost_type'
      AND kost_type_id IS NOT NULL
      AND common_area_key IS NULL
    )
    OR (
      target_type = 'common_area'
      AND kost_type_id IS NULL
      AND common_area_key IN ('lobby', 'dapur', 'rooftop', 'koridor', 'parkir')
    )
  );

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_v2_kost_type_sort
  ON hunian_gallery_images(property_id, target_type, kost_type_id, sort_order)
  WHERE deleted_at IS NULL AND target_type = 'kost_type';

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_v2_common_area_sort
  ON hunian_gallery_images(property_id, target_type, common_area_key, sort_order)
  WHERE deleted_at IS NULL AND target_type = 'common_area';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_v2_kost_type_file
  ON hunian_gallery_images(property_id, kost_type_id, file_id)
  WHERE deleted_at IS NULL AND target_type = 'kost_type';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_v2_common_area_file
  ON hunian_gallery_images(property_id, common_area_key, file_id)
  WHERE deleted_at IS NULL AND target_type = 'common_area';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_v2_kost_type_cover
  ON hunian_gallery_images(property_id, kost_type_id)
  WHERE deleted_at IS NULL AND target_type = 'kost_type' AND is_cover = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunian_gallery_v2_common_area_cover
  ON hunian_gallery_images(property_id, common_area_key)
  WHERE deleted_at IS NULL AND target_type = 'common_area' AND is_cover = true;

INSERT INTO permissions (code, name, description)
VALUES ('lease.read', 'Read Lease', 'Read lease data within an authorized property scope.')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'lease.read'
WHERE roles.code IN ('owner', 'manager', 'admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM role_permissions grant_row
    JOIN roles ON roles.id = grant_row.role_id
    JOIN permissions ON permissions.id = grant_row.permission_id
    WHERE permissions.code = 'lease.read'
      AND roles.code NOT IN ('owner', 'manager', 'admin')
  ) THEN
    RAISE EXCEPTION 'M2_RBAC_LEASE_READ_GRANT_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM role_permissions grant_row
    JOIN roles ON roles.id = grant_row.role_id
    JOIN permissions ON permissions.id = grant_row.permission_id
    WHERE permissions.code = 'billing.manage'
      AND roles.code = 'admin'
  ) THEN
    RAISE EXCEPTION 'M2_RBAC_ADMIN_BILLING_MANAGE_FORBIDDEN'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

COMMIT;
