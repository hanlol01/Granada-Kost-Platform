-- Lease-settlement v2 policy snapshots and immutable checkpoint schedules.
-- Existing leases deliberately receive no backfill: they continue under their
-- recorded legacy settlement policy unless an authorised future migration says
-- otherwise.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.lease_contract_settlements') IS NULL
     OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS lease_settlement_policy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  policy_version TEXT NOT NULL DEFAULT 'lease_settlement_v2',
  term_months SMALLINT NOT NULL,
  checkpoint_anchor_day SMALLINT NOT NULL,
  monthly_rent_amount BIGINT NOT NULL,
  initial_month_minimum_amount BIGINT NOT NULL,
  final_settlement_offset_months SMALLINT NOT NULL,
  grace_period_days SMALLINT NOT NULL DEFAULT 3,
  maximum_extension_days SMALLINT NOT NULL DEFAULT 14,
  early_termination_notice_days SMALLINT NOT NULL DEFAULT 14,
  created_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_policy_snapshots_lease_unique UNIQUE (lease_id),
  CONSTRAINT lease_settlement_policy_snapshots_version_check CHECK (
    policy_version = 'lease_settlement_v2'
  ),
  CONSTRAINT lease_settlement_policy_snapshots_term_check CHECK (
    term_months IN (3, 6, 12)
  ),
  CONSTRAINT lease_settlement_policy_snapshots_anchor_check CHECK (
    checkpoint_anchor_day BETWEEN 1 AND 31
  ),
  CONSTRAINT lease_settlement_policy_snapshots_money_check CHECK (
    monthly_rent_amount > 0
    AND initial_month_minimum_amount = monthly_rent_amount
  ),
  CONSTRAINT lease_settlement_policy_snapshots_deadline_check CHECK (
    (term_months = 3 AND final_settlement_offset_months = 2)
    OR (term_months IN (6, 12) AND final_settlement_offset_months = 3)
  ),
  CONSTRAINT lease_settlement_policy_snapshots_operating_limits_check CHECK (
    grace_period_days = 3
    AND maximum_extension_days BETWEEN 1 AND 14
    AND early_termination_notice_days = 14
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_policy_snapshots_property_lease
  ON lease_settlement_policy_snapshots(property_id, lease_id);

ALTER TABLE lease_contract_settlements
  ADD COLUMN IF NOT EXISTS policy_snapshot_id UUID
    REFERENCES lease_settlement_policy_snapshots(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_contract_settlements_policy_snapshot
  ON lease_contract_settlements(policy_snapshot_id)
  WHERE policy_snapshot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lease_settlement_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  policy_snapshot_id UUID NOT NULL REFERENCES lease_settlement_policy_snapshots(id) ON DELETE RESTRICT,
  checkpoint_code TEXT NOT NULL,
  checkpoint_sequence SMALLINT NOT NULL,
  settlement_mode TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  -- Cumulative verified rent credit required at this checkpoint. Final
  -- settlement derives its exact requirement from the live contract balance.
  minimum_required_amount BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_checkpoints_lease_sequence_unique UNIQUE (lease_id, checkpoint_sequence),
  CONSTRAINT lease_settlement_checkpoints_lease_code_unique UNIQUE (lease_id, checkpoint_code),
  CONSTRAINT lease_settlement_checkpoints_code_check CHECK (
    checkpoint_code IN ('checkpoint_1', 'checkpoint_2', 'final_settlement')
  ),
  CONSTRAINT lease_settlement_checkpoints_sequence_check CHECK (
    (checkpoint_code = 'checkpoint_1' AND checkpoint_sequence = 1)
    OR (checkpoint_code = 'checkpoint_2' AND checkpoint_sequence = 2)
    OR (checkpoint_code = 'final_settlement' AND checkpoint_sequence IN (2, 3))
  ),
  CONSTRAINT lease_settlement_checkpoints_mode_check CHECK (
    (checkpoint_code IN ('checkpoint_1', 'checkpoint_2')
      AND settlement_mode = 'minimum_monthly_coverage'
      AND minimum_required_amount IS NOT NULL
      AND minimum_required_amount > 0)
    OR (checkpoint_code = 'final_settlement'
      AND settlement_mode = 'exact_remaining_balance'
      AND minimum_required_amount IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_checkpoints_due
  ON lease_settlement_checkpoints(property_id, due_at, checkpoint_code);

CREATE TABLE IF NOT EXISTS lease_settlement_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  policy_snapshot_id UUID NOT NULL REFERENCES lease_settlement_policy_snapshots(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  original_due_at TIMESTAMPTZ NOT NULL,
  extension_due_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  granted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_extensions_lease_unique UNIQUE (lease_id),
  CONSTRAINT lease_settlement_extensions_reason_check CHECK (
    char_length(trim(reason)) BETWEEN 3 AND 1000
  ),
  CONSTRAINT lease_settlement_extensions_deadline_check CHECK (
    extension_due_at > original_due_at
    AND extension_due_at <= original_due_at + INTERVAL '14 days'
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_extensions_property_checkpoint
  ON lease_settlement_extensions(property_id, checkpoint_id);

CREATE TABLE IF NOT EXISTS lease_settlement_checkpoint_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT lease_settlement_checkpoint_events_type_check CHECK (
    event_type IN (
      'scheduled', 'minimum_coverage_met', 'final_settlement_required',
      'payment_reversed', 'overdue_started', 'grace_started',
      'extension_granted', 'admin_action_required', 'termination_started',
      'settled', 'cancelled'
    )
  ),
  CONSTRAINT lease_settlement_checkpoint_events_metadata_check CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_checkpoint_events_timeline
  ON lease_settlement_checkpoint_events(property_id, lease_id, occurred_at, id);

CREATE OR REPLACE FUNCTION validate_lease_settlement_v2_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lease_property UUID;
  snapshot_property UUID;
  snapshot_lease UUID;
  checkpoint_property UUID;
  checkpoint_lease UUID;
  checkpoint_snapshot UUID;
  checkpoint_due_at TIMESTAMPTZ;
  snapshot_term_months SMALLINT;
  snapshot_monthly_rent_amount BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'lease_settlement_policy_snapshots' THEN
    SELECT property_id INTO lease_property FROM leases WHERE id = NEW.lease_id;
    IF lease_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_POLICY_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_contract_settlements' THEN
    IF NEW.policy_snapshot_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT property_id, lease_id, term_months
      INTO snapshot_property, snapshot_lease, snapshot_term_months
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_POLICY_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
         SELECT 1 FROM lease_settlement_checkpoints
          WHERE policy_snapshot_id = NEW.policy_snapshot_id
            AND checkpoint_code = 'checkpoint_1'
       )
       OR NOT EXISTS (
         SELECT 1 FROM lease_settlement_checkpoints
          WHERE policy_snapshot_id = NEW.policy_snapshot_id
            AND checkpoint_code = 'final_settlement'
       )
       OR (snapshot_term_months IN (6, 12) AND NOT EXISTS (
         SELECT 1 FROM lease_settlement_checkpoints
          WHERE policy_snapshot_id = NEW.policy_snapshot_id
            AND checkpoint_code = 'checkpoint_2'
       ))
       OR (snapshot_term_months = 3 AND EXISTS (
         SELECT 1 FROM lease_settlement_checkpoints
          WHERE policy_snapshot_id = NEW.policy_snapshot_id
            AND checkpoint_code = 'checkpoint_2'
       )) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_CHECKPOINT_SCHEDULE_INCOMPLETE'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_settlement_checkpoints' THEN
    SELECT property_id, lease_id, term_months, monthly_rent_amount
      INTO snapshot_property, snapshot_lease, snapshot_term_months, snapshot_monthly_rent_amount
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_CHECKPOINT_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.checkpoint_code = 'checkpoint_2' AND snapshot_term_months NOT IN (6, 12))
       OR (NEW.checkpoint_code = 'final_settlement'
           AND NEW.checkpoint_sequence <> CASE WHEN snapshot_term_months = 3 THEN 2 ELSE 3 END)
       OR (NEW.checkpoint_code = 'checkpoint_1'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 2)
       OR (NEW.checkpoint_code = 'checkpoint_2'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 3) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_CHECKPOINT_POLICY_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_settlement_extensions' THEN
    SELECT property_id, lease_id
      INTO snapshot_property, snapshot_lease
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    SELECT property_id, lease_id, policy_snapshot_id, due_at
      INTO checkpoint_property, checkpoint_lease, checkpoint_snapshot, checkpoint_due_at
      FROM lease_settlement_checkpoints
     WHERE id = NEW.checkpoint_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_property IS DISTINCT FROM NEW.property_id
       OR checkpoint_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_snapshot IS DISTINCT FROM NEW.policy_snapshot_id
       OR checkpoint_due_at IS DISTINCT FROM NEW.original_due_at THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_EXTENSION_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT property_id, lease_id
    INTO checkpoint_property, checkpoint_lease
    FROM lease_settlement_checkpoints
   WHERE id = NEW.checkpoint_id;
  IF checkpoint_property IS DISTINCT FROM NEW.property_id
     OR checkpoint_lease IS DISTINCT FROM NEW.lease_id THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_EVENT_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_lease_settlement_v2_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEASE_SETTLEMENT_V2_HISTORY_IMMUTABLE'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_settlement_scope ON lease_contract_settlements;
CREATE TRIGGER trg_lease_settlement_v2_settlement_scope
  BEFORE INSERT OR UPDATE OF policy_snapshot_id ON lease_contract_settlements
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_policy_scope ON lease_settlement_policy_snapshots;
CREATE TRIGGER trg_lease_settlement_v2_policy_scope
  BEFORE INSERT ON lease_settlement_policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_checkpoint_scope ON lease_settlement_checkpoints;
CREATE TRIGGER trg_lease_settlement_v2_checkpoint_scope
  BEFORE INSERT ON lease_settlement_checkpoints
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_extension_scope ON lease_settlement_extensions;
CREATE TRIGGER trg_lease_settlement_v2_extension_scope
  BEFORE INSERT ON lease_settlement_extensions
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_event_scope ON lease_settlement_checkpoint_events;
CREATE TRIGGER trg_lease_settlement_v2_event_scope
  BEFORE INSERT ON lease_settlement_checkpoint_events
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_policy_immutable ON lease_settlement_policy_snapshots;
CREATE TRIGGER trg_lease_settlement_v2_policy_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_checkpoint_immutable ON lease_settlement_checkpoints;
CREATE TRIGGER trg_lease_settlement_v2_checkpoint_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_checkpoints
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_extension_immutable ON lease_settlement_extensions;
CREATE TRIGGER trg_lease_settlement_v2_extension_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_extensions
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_event_immutable ON lease_settlement_checkpoint_events;
CREATE TRIGGER trg_lease_settlement_v2_event_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_checkpoint_events
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();

COMMIT;
