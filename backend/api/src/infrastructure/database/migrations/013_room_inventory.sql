CREATE TABLE IF NOT EXISTS room_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  building_code TEXT NOT NULL,
  building_name TEXT NOT NULL,
  gender_policy TEXT NOT NULL,
  total_rooms INTEGER NOT NULL,
  floor_a_count INTEGER NOT NULL DEFAULT 0,
  floor_b_count INTEGER NOT NULL DEFAULT 0,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_buildings_category_check CHECK (category IN ('rukost', 'apartkost')),
  CONSTRAINT room_buildings_gender_policy_check CHECK (gender_policy IN ('male', 'female')),
  CONSTRAINT room_buildings_room_counts_check CHECK (
    total_rooms >= 0
    AND floor_a_count >= 0
    AND floor_b_count >= 0
    AND total_rooms = floor_a_count + floor_b_count
  ),
  CONSTRAINT room_buildings_price_check CHECK (monthly_price >= 0 AND yearly_price >= 0),
  CONSTRAINT room_buildings_unique_code UNIQUE (property_id, category, building_code)
);

CREATE INDEX IF NOT EXISTS idx_room_buildings_property
  ON room_buildings(property_id);

CREATE INDEX IF NOT EXISTS idx_room_buildings_category
  ON room_buildings(category);

CREATE INDEX IF NOT EXISTS idx_room_buildings_gender_policy
  ON room_buildings(gender_policy);

CREATE INDEX IF NOT EXISTS idx_room_buildings_public_visible
  ON room_buildings(public_visible);

CREATE INDEX IF NOT EXISTS idx_room_buildings_property_category_gender
  ON room_buildings(property_id, category, gender_policy);

CREATE INDEX IF NOT EXISTS idx_room_buildings_property_public_visible
  ON room_buildings(property_id, public_visible);

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS building_id UUID,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS room_code TEXT,
  ADD COLUMN IF NOT EXISTS floor_code TEXT,
  ADD COLUMN IF NOT EXISTS floor_label TEXT,
  ADD COLUMN IF NOT EXISTS public_visible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS yearly_price INTEGER,
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS import_source_row INTEGER,
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

ALTER TABLE rooms
  ALTER COLUMN public_visible SET DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_building_id_fkey'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_building_id_fkey
      FOREIGN KEY (building_id) REFERENCES room_buildings(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_category_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_category_check
      CHECK (category IS NULL OR category IN ('rukost', 'apartkost'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_floor_code_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_floor_code_check
      CHECK (floor_code IS NULL OR floor_code IN ('A', 'B'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_yearly_price_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_yearly_price_check
      CHECK (yearly_price IS NULL OR yearly_price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_import_source_row_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_import_source_row_check
      CHECK (import_source_row IS NULL OR import_source_row > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_property_room_code_unique
  ON rooms(property_id, room_code)
  WHERE room_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_building_floor
  ON rooms(building_id, floor_code)
  WHERE building_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_property_category_status
  ON rooms(property_id, category, room_status)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_property_public_visible
  ON rooms(property_id, public_visible);

CREATE INDEX IF NOT EXISTS idx_rooms_public_listing
  ON rooms(property_id, room_status, public_visible, gender_policy);

DO $$
DECLARE
  status_constraint RECORD;
BEGIN
  FOR status_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'rooms'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%room_status%'
      AND pg_get_constraintdef(oid) ILIKE '%vacant%'
      AND pg_get_constraintdef(oid) ILIKE '%reserved%'
      AND pg_get_constraintdef(oid) ILIKE '%occupied%'
      AND pg_get_constraintdef(oid) ILIKE '%maintenance%'
      AND pg_get_constraintdef(oid) ILIKE '%inactive%'
  LOOP
    EXECUTE format('ALTER TABLE rooms DROP CONSTRAINT %I', status_constraint.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_status_check'
      AND conrelid = 'rooms'::regclass
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_status_check
      CHECK (room_status IN ('vacant', 'reserved', 'occupied', 'maintenance', 'inactive', 'requires_review'));
  END IF;
END $$;
