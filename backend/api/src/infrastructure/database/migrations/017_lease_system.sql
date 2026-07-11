-- Admin UX M5 lease-lifecycle migration.
--
-- The migration runner deliberately executes every SQL migration on every
-- invocation. Keep this file additive, forward-only, and safe to replay. In
-- particular, this migration does not infer leases or occupancies from legacy
-- rows: only the LeaseService creates a lease-linked occupancy.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kost_types') IS NULL
     OR to_regclass('public.rooms') IS NULL
     OR to_regclass('public.residents') IS NULL
     OR to_regclass('public.occupancies') IS NULL
     OR to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'M5_PREREQUISITE_M2_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END $$;

-- Durable command replay. The response body is deliberately a sanitized JSON
-- envelope; it must never be used to persist KTP, file paths, or credentials.
CREATE TABLE IF NOT EXISTS idempotency_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  route TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  command_status TEXT NOT NULL DEFAULT 'pending',
  response_status INTEGER,
  response_body JSONB,
  resource_type TEXT,
  resource_id UUID,
  correlation_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT idempotency_commands_key_length_check CHECK (
    length(trim(idempotency_key)) BETWEEN 16 AND 128
  ),
  CONSTRAINT idempotency_commands_status_check CHECK (
    command_status IN ('pending', 'succeeded', 'failed')
  ),
  CONSTRAINT idempotency_commands_response_check CHECK (
    (command_status = 'pending' AND response_status IS NULL AND response_body IS NULL)
    OR (command_status IN ('succeeded', 'failed') AND response_status IS NOT NULL AND response_body IS NOT NULL)
  ),
  CONSTRAINT idempotency_commands_actor_route_key_unique UNIQUE (
    actor_user_id, route, idempotency_key
  )
);

CREATE INDEX IF NOT EXISTS idx_idempotency_commands_expiry
  ON idempotency_commands(expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_commands_property_actor_created
  ON idempotency_commands(property_id, actor_user_id, created_at DESC);

-- PostgreSQL outbox. A future dispatcher may retry pending events after commit;
-- no provider call is made by this migration or LeaseService transaction.
CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload_version SMALLINT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_events_status_check CHECK (
    event_status IN ('pending', 'processing', 'published', 'dead_lettered')
  ),
  CONSTRAINT business_events_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT business_events_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_business_events_dispatch
  ON business_events(event_status, available_at, created_at)
  WHERE event_status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_business_events_property_created
  ON business_events(property_id, created_at DESC);

CREATE TABLE IF NOT EXISTS leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_code TEXT NOT NULL,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  occupancy_id UUID NOT NULL REFERENCES occupancies(id) ON DELETE RESTRICT,
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE RESTRICT,
  lease_status TEXT NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE,
  billing_cycle TEXT NOT NULL,
  billing_anchor_day SMALLINT NOT NULL,
  next_billing_date DATE NOT NULL,
  snapshot_monthly_price BIGINT NOT NULL,
  snapshot_yearly_price BIGINT NOT NULL,
  snapshot_deposit_amount BIGINT NOT NULL,
  snapshot_room_number TEXT NOT NULL,
  snapshot_kost_type_name TEXT NOT NULL,
  notes TEXT,
  transferred_from_lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  close_reason TEXT,
  deposit_collected_amount BIGINT NOT NULL DEFAULT 0,
  deposit_deduction_amount BIGINT NOT NULL DEFAULT 0,
  deposit_refunded_amount BIGINT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leases_unique_code UNIQUE (property_id, lease_code),
  CONSTRAINT leases_unique_occupancy UNIQUE (occupancy_id),
  CONSTRAINT leases_status_check CHECK (
    lease_status IN ('active', 'ended', 'cancelled', 'transferred')
  ),
  CONSTRAINT leases_dates_check CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT leases_billing_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly')),
  CONSTRAINT leases_billing_anchor_check CHECK (billing_anchor_day BETWEEN 1 AND 31),
  CONSTRAINT leases_snapshot_amount_check CHECK (
    snapshot_monthly_price >= 0
    AND snapshot_yearly_price >= 0
    AND snapshot_deposit_amount >= 0
    AND deposit_collected_amount >= 0
    AND deposit_deduction_amount >= 0
    AND deposit_refunded_amount >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_one_active_room
  ON leases(room_id)
  WHERE lease_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_leases_one_active_resident
  ON leases(resident_id)
  WHERE lease_status = 'active';

CREATE INDEX IF NOT EXISTS idx_leases_property_status_next_billing
  ON leases(property_id, lease_status, next_billing_date);

CREATE INDEX IF NOT EXISTS idx_leases_property_resident_created
  ON leases(property_id, resident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leases_property_room_created
  ON leases(property_id, room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leases_kost_type
  ON leases(kost_type_id);

CREATE TABLE IF NOT EXISTS lease_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_history_event_type_check CHECK (
    event_type IN (
      'created', 'updated', 'invoice_generated', 'deposit_collected',
      'deposit_refunded', 'deposit_deducted', 'closed', 'transferred_out', 'transferred_in'
    )
  ),
  CONSTRAINT lease_history_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_lease_history_lease_created
  ON lease_history(lease_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lease_history_property_event_date
  ON lease_history(property_id, event_date DESC);

CREATE TABLE IF NOT EXISTS room_transfer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  from_lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  to_lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  from_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  to_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL,
  carried_deposit_amount BIGINT NOT NULL DEFAULT 0,
  required_target_deposit_amount BIGINT NOT NULL DEFAULT 0,
  top_up_amount BIGINT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_transfer_records_from_lease_unique UNIQUE (from_lease_id),
  CONSTRAINT room_transfer_records_to_lease_unique UNIQUE (to_lease_id),
  CONSTRAINT room_transfer_records_different_rooms_check CHECK (from_room_id <> to_room_id),
  CONSTRAINT room_transfer_records_amounts_check CHECK (
    carried_deposit_amount >= 0
    AND required_target_deposit_amount >= 0
    AND top_up_amount >= 0
  ),
  CONSTRAINT room_transfer_records_reason_check CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_room_transfer_records_property_effective
  ON room_transfer_records(property_id, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_room_transfer_records_resident_effective
  ON room_transfer_records(resident_id, effective_date DESC);

CREATE TABLE IF NOT EXISTS lease_deposit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount BIGINT NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  transfer_record_id UUID REFERENCES room_transfer_records(id) ON DELETE RESTRICT,
  reason_type TEXT,
  reason TEXT,
  external_reference TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'settled',
  settled_at TIMESTAMPTZ,
  settled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_deposit_transactions_type_check CHECK (
    transaction_type IN ('collection', 'carry_forward', 'top_up', 'deduction', 'refund')
  ),
  CONSTRAINT lease_deposit_transactions_direction_check CHECK (direction IN ('credit', 'debit')),
  CONSTRAINT lease_deposit_transactions_amount_check CHECK (amount >= 0),
  CONSTRAINT lease_deposit_transactions_settlement_check CHECK (
    settlement_status IN ('pending', 'settled', 'waived')
  ),
  CONSTRAINT lease_deposit_transactions_type_direction_check CHECK (
    (transaction_type IN ('collection', 'top_up') AND direction = 'credit')
    OR (transaction_type IN ('deduction', 'refund') AND direction = 'debit')
    OR transaction_type = 'carry_forward'
  ),
  CONSTRAINT lease_deposit_transactions_payment_check CHECK (
    payment_id IS NULL OR transaction_type IN ('collection', 'top_up')
  ),
  CONSTRAINT lease_deposit_transactions_reason_check CHECK (
    transaction_type NOT IN ('deduction', 'refund') OR length(trim(COALESCE(reason, ''))) > 0
  ),
  CONSTRAINT lease_deposit_transactions_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_lease_deposit_transactions_lease_created
  ON lease_deposit_transactions(lease_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lease_deposit_transactions_property_created
  ON lease_deposit_transactions(property_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lease_deposit_transactions_payment
  ON lease_deposit_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lease_deposit_transactions_transfer
  ON lease_deposit_transactions(transfer_record_id)
  WHERE transfer_record_id IS NOT NULL;

-- Refund settlement is an audit trail, not a replacement of the financial
-- entry. The ledger permits only settlement metadata changes; money/type/link
-- fields remain immutable at the database boundary.
CREATE TABLE IF NOT EXISTS lease_refund_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  deposit_transaction_id UUID NOT NULL UNIQUE REFERENCES lease_deposit_transactions(id) ON DELETE RESTRICT,
  settlement_status TEXT NOT NULL,
  payment_method TEXT,
  external_reference TEXT,
  reason TEXT,
  settled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT lease_refund_settlements_status_check CHECK (settlement_status IN ('settled', 'waived')),
  CONSTRAINT lease_refund_settlements_reason_check CHECK (
    settlement_status <> 'waived' OR length(trim(COALESCE(reason, ''))) > 0
  ),
  CONSTRAINT lease_refund_settlements_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_lease_refund_settlements_property_time
  ON lease_refund_settlements(property_id, settled_at DESC);

CREATE OR REPLACE FUNCTION prevent_lease_deposit_financial_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEASE_DEPOSIT_LEDGER_APPEND_ONLY' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.transfer_record_id IS DISTINCT FROM OLD.transfer_record_id
     OR NEW.reason_type IS DISTINCT FROM OLD.reason_type
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'LEASE_DEPOSIT_LEDGER_APPEND_ONLY' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_deposit_financial_append_only ON lease_deposit_transactions;
CREATE TRIGGER trg_lease_deposit_financial_append_only
  BEFORE UPDATE OR DELETE ON lease_deposit_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_deposit_financial_mutation();

-- Occupancy is preserved as the operational record. No legacy occupancy is
-- linked to a new lease by this migration.
ALTER TABLE occupancies
  DROP CONSTRAINT IF EXISTS occupancies_status_check,
  DROP CONSTRAINT IF EXISTS occupancies_date_check;

ALTER TABLE occupancies
  ADD CONSTRAINT occupancies_status_check CHECK (
    occupancy_status IN ('active', 'ended', 'cancelled', 'transferred')
  ),
  ADD CONSTRAINT occupancies_date_check CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE occupancy_history
  DROP CONSTRAINT IF EXISTS occupancy_history_event_type_check,
  DROP CONSTRAINT IF EXISTS occupancy_history_status_check;

ALTER TABLE occupancy_history
  ADD CONSTRAINT occupancy_history_event_type_check CHECK (
    event_type IN ('check_in', 'check_out', 'status_sync', 'transfer_out', 'transfer_in')
  ),
  ADD CONSTRAINT occupancy_history_status_check CHECK (
    (from_status IS NULL OR from_status IN ('active', 'ended', 'cancelled', 'transferred'))
    AND to_status IN ('active', 'ended', 'cancelled', 'transferred')
  );

-- Lease invoices intentionally leave billing_period_id NULL. Legacy/manual
-- invoices remain untouched and retain their previous non-null period links.
ALTER TABLE invoices
  ALTER COLUMN billing_period_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cycle_start_date DATE,
  ADD COLUMN IF NOT EXISTS cycle_end_date DATE,
  ADD COLUMN IF NOT EXISTS snapshot_billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_rent_amount BIGINT,
  ADD COLUMN IF NOT EXISTS generation_source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_lease_cycle_dates_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_lease_cycle_dates_check CHECK (
        cycle_end_date IS NULL OR cycle_start_date IS NULL OR cycle_end_date >= cycle_start_date
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_lease_billing_cycle_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_lease_billing_cycle_check CHECK (
        snapshot_billing_cycle IS NULL OR snapshot_billing_cycle IN ('monthly', 'yearly')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_lease_snapshot_rent_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_lease_snapshot_rent_check CHECK (
        snapshot_rent_amount IS NULL OR snapshot_rent_amount >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_generation_source_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_generation_source_check CHECK (generation_source IN ('manual', 'auto'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_lease_extension_required_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_lease_extension_required_check CHECK (
        lease_id IS NULL
        OR (
          cycle_start_date IS NOT NULL
          AND cycle_end_date IS NOT NULL
          AND snapshot_billing_cycle IS NOT NULL
          AND snapshot_rent_amount IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_lease_cycle_start_unique
  ON invoices(lease_id, cycle_start_date)
  WHERE lease_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_property_lease_due
  ON invoices(property_id, lease_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_lease_cycle_start
  ON invoices(lease_id, cycle_start_date DESC)
  WHERE lease_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_property_generation_due
  ON invoices(property_id, generation_source, due_date DESC);

-- M2 owns lease.read grants. Assert the final contract rather than mutating
-- grants here: owner/manager/admin only, and never billing.manage for admin.
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
    RAISE EXCEPTION 'M5_RBAC_LEASE_READ_GRANT_INVALID'
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
    RAISE EXCEPTION 'M5_RBAC_ADMIN_BILLING_MANAGE_FORBIDDEN'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

COMMIT;
