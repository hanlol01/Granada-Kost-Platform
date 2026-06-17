CREATE TABLE IF NOT EXISTS residents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  ktp_number TEXT,
  gender TEXT,
  resident_status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT residents_status_check CHECK (resident_status IN ('active', 'inactive')),
  CONSTRAINT residents_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_ktp_unique_active
  ON residents(ktp_number)
  WHERE ktp_number IS NOT NULL AND resident_status = 'active';

CREATE INDEX IF NOT EXISTS idx_residents_property_status
  ON residents(property_id, resident_status);

CREATE TABLE IF NOT EXISTS resident_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  relationship TEXT,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS occupancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE,
  occupancy_status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT occupancies_status_check CHECK (occupancy_status IN ('active', 'ended', 'cancelled')),
  CONSTRAINT occupancies_date_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_occupancies_one_active_room
  ON occupancies(room_id)
  WHERE occupancy_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_occupancies_one_active_resident
  ON occupancies(resident_id)
  WHERE occupancy_status = 'active';

CREATE INDEX IF NOT EXISTS idx_occupancies_property_status
  ON occupancies(property_id, occupancy_status);

CREATE TABLE IF NOT EXISTS occupancy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occupancy_id UUID NOT NULL REFERENCES occupancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_date DATE NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT occupancy_history_event_type_check CHECK (event_type IN ('check_in', 'check_out', 'status_sync')),
  CONSTRAINT occupancy_history_status_check CHECK (
    (from_status IS NULL OR from_status IN ('active', 'ended', 'cancelled')) AND
    to_status IN ('active', 'ended', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_occupancy_history_occupancy_time
  ON occupancy_history(occupancy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS check_in_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  occupancy_id UUID REFERENCES occupancies(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_in_records_property_time
  ON check_in_records(property_id, checked_in_at DESC);

CREATE TABLE IF NOT EXISTS check_out_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  occupancy_id UUID NOT NULL REFERENCES occupancies(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  requested_check_out_date DATE NOT NULL,
  reason TEXT,
  check_out_status TEXT NOT NULL DEFAULT 'requested',
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  finalized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT check_out_requests_status_check CHECK (
    check_out_status IN ('requested', 'approved', 'rejected', 'finalized', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_check_out_requests_property_status
  ON check_out_requests(property_id, check_out_status, created_at DESC);
