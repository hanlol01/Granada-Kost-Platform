-- W07B room transfer: scheduled transfer commands, standardized reason
-- taxonomy, inspection-required room lifecycle, and transfer grant revocation.
--
-- The migration runner replays every SQL file. Keep this migration additive
-- and idempotent. No lease, occupancy, invoice, deposit, or owner-finance
-- rows are mutated here. Legacy room_transfer_records keep their financial
-- amounts untouched and are only annotated with the W07B taxonomy columns.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. rooms.room_status gains 'inspection_required'.
-- ---------------------------------------------------------------------------
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
      CHECK (room_status IN (
        'vacant', 'reserved', 'occupied', 'maintenance', 'inactive',
        'requires_review', 'inspection_required'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Scheduled transfer command authority.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lease_transfer_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  from_lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  from_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  to_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  transfer_path TEXT NOT NULL,
  effective_date DATE NOT NULL,
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  exception_reason TEXT,
  state TEXT NOT NULL DEFAULT 'scheduled',
  failure_code TEXT,
  failure_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancel_reason TEXT,
  commercial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  transfer_record_id UUID REFERENCES room_transfer_records(id) ON DELETE RESTRICT,
  executed_late BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT lease_transfer_commands_path_check CHECK (
    transfer_path IN ('end_period', 'same_day_exception')
  ),
  CONSTRAINT lease_transfer_commands_reason_code_check CHECK (
    reason_code IN (
      'resident_request', 'room_issue', 'property_operation',
      'eligibility_correction', 'commercial_adjustment', 'other'
    )
  ),
  CONSTRAINT lease_transfer_commands_state_check CHECK (
    state IN ('scheduled', 'executed', 'cancelled', 'failed')
  ),
  CONSTRAINT lease_transfer_commands_reason_detail_check CHECK (
    reason_code <> 'other' OR reason_detail IS NOT NULL
  ),
  CONSTRAINT lease_transfer_commands_exception_reason_check CHECK (
    transfer_path <> 'same_day_exception' OR exception_reason IS NOT NULL
  ),
  CONSTRAINT lease_transfer_commands_cancel_reason_check CHECK (
    state <> 'cancelled' OR cancel_reason IS NOT NULL
  ),
  CONSTRAINT lease_transfer_commands_failure_code_check CHECK (
    state <> 'failed' OR failure_code IS NOT NULL
  ),
  CONSTRAINT lease_transfer_commands_executed_check CHECK (
    state <> 'executed' OR (executed_at IS NOT NULL AND transfer_record_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_transfer_commands_scheduled_lease
  ON lease_transfer_commands(from_lease_id)
  WHERE state = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_transfer_commands_scheduled_room
  ON lease_transfer_commands(to_room_id)
  WHERE state = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_lease_transfer_commands_due
  ON lease_transfer_commands(property_id, effective_date)
  WHERE state = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_lease_transfer_commands_property_state
  ON lease_transfer_commands(property_id, state, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. room_transfer_records gains the W07B taxonomy and command linkage.
-- ---------------------------------------------------------------------------
ALTER TABLE room_transfer_records
  ADD COLUMN IF NOT EXISTS transfer_command_id UUID REFERENCES lease_transfer_commands(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transfer_path TEXT,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS exception_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Legacy M6 transfers were same-day-only free-text transfers. Annotate them
-- without touching any financial amount or foreign key.
UPDATE room_transfer_records
SET transfer_path = 'same_day_exception',
    reason_code = 'other',
    reason_detail = reason,
    exception_reason = 'legacy M6 same-day transfer'
WHERE transfer_path IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_transfer_records' AND column_name = 'transfer_path' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE room_transfer_records ALTER COLUMN transfer_path SET NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_transfer_records' AND column_name = 'reason_code' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE room_transfer_records ALTER COLUMN reason_code SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_transfer_records_path_check' AND conrelid = 'room_transfer_records'::regclass
  ) THEN
    ALTER TABLE room_transfer_records
      ADD CONSTRAINT room_transfer_records_path_check
      CHECK (transfer_path IN ('end_period', 'same_day_exception'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_transfer_records_reason_code_check' AND conrelid = 'room_transfer_records'::regclass
  ) THEN
    ALTER TABLE room_transfer_records
      ADD CONSTRAINT room_transfer_records_reason_code_check
      CHECK (reason_code IN (
        'resident_request', 'room_issue', 'property_operation',
        'eligibility_correction', 'commercial_adjustment', 'other'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_transfer_records_reason_detail_check' AND conrelid = 'room_transfer_records'::regclass
  ) THEN
    ALTER TABLE room_transfer_records
      ADD CONSTRAINT room_transfer_records_reason_detail_check
      CHECK (reason_code <> 'other' OR reason_detail IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_transfer_records_exception_reason_check' AND conrelid = 'room_transfer_records'::regclass
  ) THEN
    ALTER TABLE room_transfer_records
      ADD CONSTRAINT room_transfer_records_exception_reason_check
      CHECK (transfer_path <> 'same_day_exception' OR exception_reason IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. lease_history event vocabulary for the scheduled transfer lifecycle.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lease_history_event_type_check' AND conrelid = 'lease_history'::regclass
  ) THEN
    ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
  END IF;

  ALTER TABLE lease_history
    ADD CONSTRAINT lease_history_event_type_check CHECK (
      event_type IN (
        'created', 'updated', 'invoice_generated', 'deposit_collected',
        'deposit_refunded', 'deposit_deducted', 'closed', 'transferred_out',
        'transferred_in', 'transfer_scheduled', 'transfer_cancelled', 'transfer_failed'
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- 5. Smart-lock grant revocation reason for transfer cutover.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'smart_lock_access_grants_revoke_reason_check'
      AND conrelid = 'smart_lock_access_grants'::regclass
  ) THEN
    ALTER TABLE smart_lock_access_grants DROP CONSTRAINT smart_lock_access_grants_revoke_reason_check;
  END IF;

  ALTER TABLE smart_lock_access_grants
    ADD CONSTRAINT smart_lock_access_grants_revoke_reason_check CHECK (
      revoke_reason IS NULL
        OR revoke_reason IN ('checkout', 'restriction', 'manual_admin', 'security_incident', 'expired', 'transfer')
    );
END $$;

COMMIT;
