CREATE TABLE IF NOT EXISTS complaint_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  default_priority TEXT NOT NULL DEFAULT 'low',
  description TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT complaint_categories_priority_check CHECK (default_priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT complaint_categories_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT complaint_categories_unique_code UNIQUE (property_id, normalized_code)
);

CREATE INDEX IF NOT EXISTS idx_cc_property_active
  ON complaint_categories(property_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS technician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  phone TEXT,
  skill_tags TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT technician_profiles_unique_user UNIQUE (property_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_property_active
  ON technician_profiles(property_id, is_active);

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES complaint_categories(id) ON DELETE RESTRICT,
  complaint_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'low',
  complaint_status TEXT NOT NULL DEFAULT 'submitted',
  reopen_count INTEGER NOT NULL DEFAULT 0,
  response_sla_breached BOOLEAN NOT NULL DEFAULT false,
  resolution_sla_breached BOOLEAN NOT NULL DEFAULT false,
  location_note TEXT,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  snapshot_room_number TEXT,
  snapshot_resident_name TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT complaints_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT complaints_status_check CHECK (
    complaint_status IN (
      'submitted',
      'acknowledged',
      'in_progress',
      'on_hold',
      'escalated',
      'resolved',
      'reopened',
      'closed',
      'cancelled'
    )
  ),
  CONSTRAINT complaints_reopen_count_check CHECK (reopen_count >= 0),
  CONSTRAINT complaints_location_check CHECK (room_id IS NOT NULL OR location_note IS NOT NULL),
  CONSTRAINT complaints_unique_code UNIQUE (property_id, complaint_code)
);

CREATE INDEX IF NOT EXISTS idx_complaints_admin_queue
  ON complaints(property_id, complaint_status, priority, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_complaints_resident_history
  ON complaints(resident_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_complaints_sla_breach
  ON complaints(property_id)
  WHERE response_sla_breached = true OR resolution_sla_breached = true;

CREATE INDEX IF NOT EXISTS idx_complaints_category
  ON complaints(property_id, category_id, complaint_status);

CREATE INDEX IF NOT EXISTS idx_complaints_assigned
  ON complaints(assigned_to_user_id, complaint_status);

CREATE INDEX IF NOT EXISTS idx_complaints_autoclose
  ON complaints(complaint_status, resolved_at)
  WHERE complaint_status = 'resolved';

CREATE TABLE IF NOT EXISTS complaint_status_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  label TEXT,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT complaint_status_histories_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'submitted',
      'acknowledged',
      'in_progress',
      'on_hold',
      'escalated',
      'resolved',
      'reopened',
      'closed',
      'cancelled'
    )
  ),
  CONSTRAINT complaint_status_histories_to_status_check CHECK (
    to_status IN (
      'submitted',
      'acknowledged',
      'in_progress',
      'on_hold',
      'escalated',
      'resolved',
      'reopened',
      'closed',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_csh_complaint_timeline
  ON complaint_status_histories(complaint_id, changed_at ASC);

CREATE TABLE IF NOT EXISTS complaint_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT complaint_files_unique_file UNIQUE (complaint_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_complaint
  ON complaint_files(complaint_id);

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  complaint_id UUID REFERENCES complaints(id) ON DELETE SET NULL,
  work_order_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  work_order_status TEXT NOT NULL DEFAULT 'open',
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rework_reason TEXT,
  cancel_reason TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_orders_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT work_orders_status_check CHECK (
    work_order_status IN (
      'open',
      'assigned',
      'in_progress',
      'on_hold',
      'completed',
      'rework_required',
      'verified',
      'cancelled'
    )
  ),
  CONSTRAINT work_orders_unique_code UNIQUE (property_id, work_order_code)
);

CREATE INDEX IF NOT EXISTS idx_wo_admin_queue
  ON maintenance_work_orders(property_id, work_order_status, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wo_technician_queue
  ON maintenance_work_orders(assigned_to_user_id, work_order_status);

CREATE INDEX IF NOT EXISTS idx_wo_complaint
  ON maintenance_work_orders(complaint_id)
  WHERE complaint_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS maintenance_work_order_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT work_order_histories_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'open',
      'assigned',
      'in_progress',
      'on_hold',
      'completed',
      'rework_required',
      'verified',
      'cancelled'
    )
  ),
  CONSTRAINT work_order_histories_to_status_check CHECK (
    to_status IN (
      'open',
      'assigned',
      'in_progress',
      'on_hold',
      'completed',
      'rework_required',
      'verified',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_woh_wo_timeline
  ON maintenance_work_order_histories(work_order_id, changed_at ASC);

CREATE TABLE IF NOT EXISTS maintenance_work_order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  file_id UUID NOT NULL,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_work_order_files_unique_file UNIQUE (work_order_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_wof_work_order
  ON maintenance_work_order_files(work_order_id);

CREATE TABLE IF NOT EXISTS maintenance_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost BIGINT NOT NULL DEFAULT 0,
  total_cost BIGINT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT materials_quantity_check CHECK (quantity > 0),
  CONSTRAINT materials_cost_check CHECK (unit_cost >= 0 AND total_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_mm_work_order
  ON maintenance_materials(work_order_id);
