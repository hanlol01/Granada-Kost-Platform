CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT properties_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS property_settings (
  property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  default_due_day INTEGER NOT NULL DEFAULT 25,
  late_fee_percent_per_day NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  booking_fee_amount INTEGER NOT NULL DEFAULT 100000,
  quiet_hour_start TIME,
  guest_report_deadline TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_settings_due_day_check CHECK (default_due_day BETWEEN 1 AND 31),
  CONSTRAINT property_settings_amount_check CHECK (booking_fee_amount >= 0)
);

CREATE TABLE IF NOT EXISTS room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  default_deposit_amount INTEGER NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_types_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT room_types_price_check CHECK (base_price >= 0 AND default_deposit_amount >= 0),
  CONSTRAINT room_types_unique_name UNIQUE (property_id, name)
);

CREATE INDEX IF NOT EXISTS idx_room_types_property_status
  ON room_types(property_id, status);

CREATE TABLE IF NOT EXISTS room_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_facilities_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT room_facilities_unique_name UNIQUE (property_id, name)
);

CREATE INDEX IF NOT EXISTS idx_room_facilities_property_status
  ON room_facilities(property_id, status);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  floor TEXT,
  size_label TEXT,
  monthly_price INTEGER NOT NULL,
  deposit_amount INTEGER NOT NULL,
  room_status TEXT NOT NULL DEFAULT 'vacant',
  primary_photo_file_id UUID,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rooms_status_check CHECK (room_status IN ('vacant', 'reserved', 'occupied', 'maintenance', 'inactive')),
  CONSTRAINT rooms_amount_check CHECK (monthly_price >= 0 AND deposit_amount >= 0),
  CONSTRAINT rooms_unique_number UNIQUE (property_id, number)
);

CREATE INDEX IF NOT EXISTS idx_rooms_property_status_floor_type
  ON rooms(property_id, room_status, floor, room_type_id);

CREATE TABLE IF NOT EXISTS room_facility_assignments (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES room_facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, facility_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  before_data JSONB,
  after_data JSONB,
  result_status TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_result_status_check CHECK (result_status IN ('success', 'failed', 'denied'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_time
  ON audit_logs(resource_type, resource_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_property_time
  ON audit_logs(property_id, occurred_at DESC);
