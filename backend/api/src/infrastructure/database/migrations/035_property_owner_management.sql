BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS property_owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  profile_status TEXT NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_profiles_name_check CHECK (length(btrim(full_name)) BETWEEN 2 AND 150),
  CONSTRAINT property_owner_profiles_identifier_check CHECK (
    (email IS NOT NULL AND length(btrim(email)) > 0)
    OR (phone IS NOT NULL AND length(btrim(phone)) > 0)
  ),
  CONSTRAINT property_owner_profiles_status_check CHECK (profile_status IN ('active', 'archived')),
  CONSTRAINT property_owner_profiles_archive_check CHECK (
    (profile_status = 'active' AND archived_at IS NULL)
    OR (profile_status = 'archived' AND archived_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_owner_profiles_property_email
  ON property_owner_profiles(property_id, lower(email)) WHERE email IS NOT NULL AND profile_status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_owner_profiles_property_phone
  ON property_owner_profiles(property_id, phone) WHERE phone IS NOT NULL AND profile_status = 'active';
CREATE INDEX IF NOT EXISTS idx_property_owner_profiles_property_status
  ON property_owner_profiles(property_id, profile_status, created_at DESC);

CREATE TABLE IF NOT EXISTS building_owner_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  building_id UUID NOT NULL REFERENCES room_buildings(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_until DATE,
  assignment_status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  released_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT building_owner_assignments_dates_check CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT building_owner_assignments_status_check CHECK (
    assignment_status IN ('scheduled', 'active', 'released')
  ),
  CONSTRAINT building_owner_assignments_released_period_check CHECK (
    assignment_status <> 'released' OR effective_until IS NOT NULL
  ),
  CONSTRAINT building_owner_assignments_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500)
);

CREATE TABLE IF NOT EXISTS room_owner_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_until DATE,
  assignment_status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  released_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_owner_assignments_dates_check CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT room_owner_assignments_status_check CHECK (
    assignment_status IN ('scheduled', 'active', 'released')
  ),
  CONSTRAINT room_owner_assignments_released_period_check CHECK (
    assignment_status <> 'released' OR effective_until IS NOT NULL
  ),
  CONSTRAINT room_owner_assignments_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'building_owner_assignments_no_overlap'
      AND conrelid = 'building_owner_assignments'::regclass
  ) THEN
    ALTER TABLE building_owner_assignments
      ADD CONSTRAINT building_owner_assignments_no_overlap
      EXCLUDE USING gist (
        property_id WITH =,
        building_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
      ) WHERE (assignment_status IN ('scheduled', 'active', 'released'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_owner_assignments_no_overlap'
      AND conrelid = 'room_owner_assignments'::regclass
  ) THEN
    ALTER TABLE room_owner_assignments
      ADD CONSTRAINT room_owner_assignments_no_overlap
      EXCLUDE USING gist (
        property_id WITH =,
        room_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
      ) WHERE (assignment_status IN ('scheduled', 'active', 'released'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_building_owner_assignments_owner_period
  ON building_owner_assignments(owner_profile_id, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_building_owner_assignments_property_status
  ON building_owner_assignments(property_id, assignment_status, effective_from);
CREATE INDEX IF NOT EXISTS idx_room_owner_assignments_owner_period
  ON room_owner_assignments(owner_profile_id, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_room_owner_assignments_property_status
  ON room_owner_assignments(property_id, assignment_status, effective_from);

CREATE OR REPLACE FUNCTION validate_property_owner_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  profile_property UUID;
  asset_property UUID;
  asset_category TEXT;
BEGIN
  SELECT property_id INTO profile_property
  FROM property_owner_profiles
  WHERE id = NEW.owner_profile_id AND profile_status = 'active';

  IF profile_property IS NULL OR profile_property <> NEW.property_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_PROFILE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'building_owner_assignments' THEN
    SELECT property_id, category INTO asset_property, asset_category
    FROM room_buildings WHERE id = NEW.building_id;
    IF asset_property IS NULL OR asset_property <> NEW.property_id OR asset_category <> 'rukost' THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_BUILDING_AUTHORITY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT property_id, category INTO asset_property, asset_category
    FROM rooms WHERE id = NEW.room_id;
    IF asset_property IS NULL OR asset_property <> NEW.property_id OR asset_category <> 'apartkost' THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_ROOM_AUTHORITY_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_building_owner_assignment ON building_owner_assignments;
CREATE TRIGGER trg_validate_building_owner_assignment
BEFORE INSERT OR UPDATE ON building_owner_assignments
FOR EACH ROW EXECUTE FUNCTION validate_property_owner_assignment();

DROP TRIGGER IF EXISTS trg_validate_room_owner_assignment ON room_owner_assignments;
CREATE TRIGGER trg_validate_room_owner_assignment
BEFORE INSERT OR UPDATE ON room_owner_assignments
FOR EACH ROW EXECUTE FUNCTION validate_property_owner_assignment();

CREATE TABLE IF NOT EXISTS property_owner_commercial_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_until DATE,
  gross_room_month_amount INTEGER NOT NULL,
  owner_room_month_amount INTEGER NOT NULL,
  operator_room_month_fee INTEGER NOT NULL,
  recognition_policy TEXT NOT NULL DEFAULT 'collected_and_earned',
  partial_owner_numerator INTEGER NOT NULL DEFAULT 5,
  partial_operator_numerator INTEGER NOT NULL DEFAULT 1,
  policy_status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_commercial_policy_amount_check CHECK (
    gross_room_month_amount > 0
    AND owner_room_month_amount >= 0
    AND operator_room_month_fee >= 0
    AND owner_room_month_amount + operator_room_month_fee = gross_room_month_amount
  ),
  CONSTRAINT property_owner_commercial_policy_period_check CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT property_owner_commercial_policy_recognition_check CHECK (
    recognition_policy = 'collected_and_earned'
  ),
  CONSTRAINT property_owner_commercial_policy_ratio_check CHECK (
    partial_owner_numerator > 0 AND partial_operator_numerator > 0
  ),
  CONSTRAINT property_owner_commercial_policy_status_check CHECK (
    policy_status IN ('active', 'retired')
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_commercial_policies_no_overlap'
      AND conrelid = 'property_owner_commercial_policies'::regclass
  ) THEN
    ALTER TABLE property_owner_commercial_policies
      ADD CONSTRAINT property_owner_commercial_policies_no_overlap
      EXCLUDE USING gist (
        property_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
      ) WHERE (policy_status = 'active');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS property_owner_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  ownership_kind TEXT NOT NULL,
  ownership_assignment_id UUID NOT NULL,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  earning_month DATE NOT NULL,
  gross_collected_amount INTEGER NOT NULL,
  owner_earned_amount INTEGER NOT NULL,
  operator_fee_amount INTEGER NOT NULL,
  earning_status TEXT NOT NULL DEFAULT 'recognized',
  correction_of_earning_id UUID REFERENCES property_owner_earnings(id) ON DELETE RESTRICT,
  policy_id UUID NOT NULL REFERENCES property_owner_commercial_policies(id) ON DELETE RESTRICT,
  recognized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_earnings_kind_check CHECK (ownership_kind IN ('building', 'room')),
  CONSTRAINT property_owner_earnings_amount_check CHECK (
    gross_collected_amount >= 0
    AND owner_earned_amount >= 0
    AND operator_fee_amount >= 0
    AND owner_earned_amount + operator_fee_amount = gross_collected_amount
  ),
  CONSTRAINT property_owner_earnings_month_check CHECK (earning_month = date_trunc('month', earning_month)::date),
  CONSTRAINT property_owner_earnings_status_check CHECK (earning_status IN ('recognized', 'reversed')),
  CONSTRAINT property_owner_earnings_unique_event UNIQUE (owner_profile_id, room_id, payment_id, earning_month, earning_status)
);

CREATE INDEX IF NOT EXISTS idx_property_owner_earnings_owner_month
  ON property_owner_earnings(owner_profile_id, earning_month, recognized_at);
CREATE INDEX IF NOT EXISTS idx_property_owner_earnings_property_month
  ON property_owner_earnings(property_id, earning_month, recognized_at);

CREATE TABLE IF NOT EXISTS property_owner_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount INTEGER NOT NULL,
  owner_amount INTEGER NOT NULL,
  operator_fee_amount INTEGER NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'draft',
  reference TEXT,
  notes TEXT,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_settlements_period_check CHECK (period_end >= period_start),
  CONSTRAINT property_owner_settlements_amount_check CHECK (
    gross_amount >= 0 AND owner_amount >= 0 AND operator_fee_amount >= 0
    AND owner_amount + operator_fee_amount = gross_amount
  ),
  CONSTRAINT property_owner_settlements_status_check CHECK (
    settlement_status IN ('draft', 'ready_for_review', 'approved', 'paid', 'void')
  )
);

CREATE TABLE IF NOT EXISTS property_owner_settlement_lines (
  settlement_id UUID NOT NULL REFERENCES property_owner_settlements(id) ON DELETE RESTRICT,
  earning_id UUID NOT NULL REFERENCES property_owner_earnings(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (settlement_id, earning_id),
  UNIQUE (earning_id)
);

INSERT INTO roles (code, name, description, is_system_role)
VALUES ('property_owner', 'Property Owner', 'Read-only economic owner of assigned assets', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system_role = true;

INSERT INTO permissions (code, name, description)
VALUES
  ('property_owner.manage', 'Manage property owners', 'Create owner accounts and manage effective-dated ownership'),
  ('property_owner.settlement.manage', 'Manage owner settlements', 'Prepare, approve, and record owner settlements'),
  ('property_owner.asset.read', 'Read owned assets', 'Read safe operational data for assets currently owned'),
  ('property_owner.finance.read', 'Read owner finance', 'Read period-bound safe earning and settlement summaries'),
  ('property_owner.complaint.read', 'Read owned asset complaints', 'Read safe complaint summaries for owned assets'),
  ('property_owner.maintenance.read', 'Read owned asset maintenance', 'Read safe maintenance summaries for owned assets'),
  ('property_owner.notification.read', 'Read owner notifications', 'Read notifications scoped to owned assets'),
  ('property_owner.report.view', 'View property owner reports', 'Read period-bound safe reports for owned assets')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code IN ('property_owner.manage', 'property_owner.settlement.manage')
WHERE roles.code IN ('owner', 'manager', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code IN (
  'property_owner.asset.read',
  'property_owner.finance.read',
  'property_owner.complaint.read',
  'property_owner.maintenance.read',
  'property_owner.notification.read',
  'property_owner.report.view'
)
WHERE roles.code = 'property_owner'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions
USING roles, permissions
WHERE role_permissions.role_id = roles.id
  AND role_permissions.permission_id = permissions.id
  AND roles.code = 'property_owner'
  AND permissions.code IN ('property.read', 'room.read', 'resident.read', 'billing.read');

INSERT INTO property_owner_commercial_policies (
  property_id, effective_from, gross_room_month_amount, owner_room_month_amount,
  operator_room_month_fee, recognition_policy, partial_owner_numerator,
  partial_operator_numerator, policy_status, reason
)
SELECT properties.id, CURRENT_DATE, 1800000, 1500000, 300000,
       'collected_and_earned', 5, 1, 'active', 'Initial W10 owner commercial authority'
FROM properties
WHERE NOT EXISTS (
  SELECT 1 FROM property_owner_commercial_policies policies
  WHERE policies.property_id = properties.id AND policies.policy_status = 'active'
);

COMMIT;
