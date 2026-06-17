ALTER TABLE property_settings
  ADD COLUMN IF NOT EXISTS parking_management_mode TEXT NOT NULL DEFAULT 'unmanaged',
  ADD COLUMN IF NOT EXISTS max_vehicles_per_resident INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS parking_capacity_motorcycle INTEGER,
  ADD COLUMN IF NOT EXISTS parking_capacity_car INTEGER,
  ADD COLUMN IF NOT EXISTS parking_requires_approval BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_settings_parking_mode_check'
  ) THEN
    ALTER TABLE property_settings
      ADD CONSTRAINT property_settings_parking_mode_check
      CHECK (parking_management_mode IN ('unmanaged', 'zone', 'slot'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_settings_vehicle_limit_check'
  ) THEN
    ALTER TABLE property_settings
      ADD CONSTRAINT property_settings_vehicle_limit_check
      CHECK (max_vehicles_per_resident > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_settings_parking_capacity_check'
  ) THEN
    ALTER TABLE property_settings
      ADD CONSTRAINT property_settings_parking_capacity_check
      CHECK (
        (parking_capacity_motorcycle IS NULL OR parking_capacity_motorcycle >= 0)
        AND (parking_capacity_car IS NULL OR parking_capacity_car >= 0)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  vehicle_code TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  brand TEXT NOT NULL,
  color TEXT NOT NULL,
  year TEXT,
  vehicle_status TEXT NOT NULL DEFAULT 'pending_approval',
  notes TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  suspend_reason TEXT,
  deactivation_reason TEXT,
  deactivated_at TIMESTAMPTZ,
  snapshot_resident_name TEXT NOT NULL,
  snapshot_room_number TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_type_check CHECK (vehicle_type IN ('motorcycle', 'car', 'bicycle', 'electric_scooter', 'other')),
  CONSTRAINT vehicles_status_check CHECK (
    vehicle_status IN (
      'pending_approval',
      'active',
      'rejected',
      'suspended',
      'transfer_pending',
      'inactive'
    )
  ),
  CONSTRAINT vehicles_plate_required_check CHECK (length(trim(plate_number)) > 0),
  CONSTRAINT vehicles_unique_code UNIQUE (property_id, vehicle_code)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_admin_list
  ON vehicles(property_id, vehicle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicles_resident
  ON vehicles(resident_id, vehicle_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_active
  ON vehicles(property_id, plate_number)
  WHERE vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending');

CREATE INDEX IF NOT EXISTS idx_vehicles_approval_queue
  ON vehicles(property_id, created_at ASC)
  WHERE vehicle_status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_vehicles_type_status
  ON vehicles(property_id, vehicle_type, vehicle_status);

CREATE TABLE IF NOT EXISTS vehicle_status_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT vehicle_status_histories_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'pending_approval',
      'active',
      'rejected',
      'suspended',
      'transfer_pending',
      'inactive'
    )
  ),
  CONSTRAINT vehicle_status_histories_to_status_check CHECK (
    to_status IN (
      'pending_approval',
      'active',
      'rejected',
      'suspended',
      'transfer_pending',
      'inactive'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_vsh_vehicle_timeline
  ON vehicle_status_histories(vehicle_id, changed_at ASC);

CREATE TABLE IF NOT EXISTS vehicle_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  file_purpose TEXT NOT NULL DEFAULT 'vehicle_photo',
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_files_purpose_check CHECK (file_purpose IN ('vehicle_photo', 'stnk', 'other')),
  CONSTRAINT vehicle_files_unique_file UNIQUE (vehicle_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_vf_vehicle
  ON vehicle_files(vehicle_id);

CREATE TABLE IF NOT EXISTS parking_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  zone_code TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  zone_type TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  location_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parking_zones_type_check CHECK (zone_type IN ('motorcycle', 'car', 'mixed')),
  CONSTRAINT parking_zones_capacity_check CHECK (capacity >= 0),
  CONSTRAINT parking_zones_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT parking_zones_unique_code UNIQUE (property_id, zone_code)
);

CREATE INDEX IF NOT EXISTS idx_pz_property_active
  ON parking_zones(property_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS parking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES parking_zones(id) ON DELETE CASCADE,
  slot_number TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  slot_status TEXT NOT NULL DEFAULT 'available',
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parking_slots_type_check CHECK (slot_type IN ('motorcycle', 'car')),
  CONSTRAINT parking_slots_status_check CHECK (slot_status IN ('available', 'occupied', 'reserved', 'maintenance')),
  CONSTRAINT parking_slots_unique_number UNIQUE (zone_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_ps_zone_status
  ON parking_slots(zone_id, slot_status);

CREATE INDEX IF NOT EXISTS idx_ps_vehicle
  ON parking_slots(vehicle_id)
  WHERE vehicle_id IS NOT NULL;

INSERT INTO permissions (code, name, description)
VALUES
  ('vehicle.manage', 'Manage Vehicles', 'Register, approve, update, suspend, and deactivate vehicles.'),
  ('parking.manage', 'Manage Parking', 'Manage parking zones and slots.')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('owner', 'vehicle.manage'),
    ('owner', 'parking.manage'),
    ('manager', 'vehicle.manage'),
    ('manager', 'parking.manage'),
    ('admin', 'vehicle.manage'),
    ('admin', 'parking.manage')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM grants
JOIN roles ON roles.code = grants.role_code
JOIN permissions ON permissions.code = grants.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
