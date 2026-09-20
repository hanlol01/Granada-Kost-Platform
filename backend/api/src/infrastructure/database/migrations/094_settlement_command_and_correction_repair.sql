-- Repair the shared overdue-command scope guard and allow lease corrections to
-- append a new settlement-policy version without deleting the prior schedule.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_payment_promises') IS NULL
     OR to_regclass('public.lease_settlement_notification_ledger') IS NULL
     OR to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL THEN
    RAISE EXCEPTION 'SETTLEMENT_COMMAND_AND_CORRECTION_REPAIR_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_lease_settlement_overdue_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  checkpoint_property UUID;
  checkpoint_lease UUID;
  checkpoint_policy UUID;
  recipient_user UUID;
BEGIN
  SELECT property_id, lease_id, policy_snapshot_id
    INTO checkpoint_property, checkpoint_lease, checkpoint_policy
    FROM lease_settlement_checkpoints
   WHERE id = NEW.checkpoint_id;

  IF checkpoint_property IS DISTINCT FROM NEW.property_id
     OR checkpoint_lease IS DISTINCT FROM NEW.lease_id THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_OVERDUE_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'lease_payment_promises' THEN
    IF checkpoint_policy IS DISTINCT FROM
       NULLIF(to_jsonb(NEW)->>'policy_snapshot_id', '')::uuid THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_OVERDUE_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'lease_settlement_notification_ledger' THEN
    recipient_user := NULLIF(to_jsonb(NEW)->>'recipient_user_id', '')::uuid;
    IF recipient_user IS NULL OR NOT EXISTS (
      SELECT 1
        FROM user_property_roles membership
       WHERE membership.user_id=recipient_user
         AND membership.property_id=NEW.property_id
         AND membership.revoked_at IS NULL
      UNION ALL
      SELECT 1
        FROM leases lease
        JOIN residents resident
          ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
       WHERE lease.id=NEW.lease_id
         AND lease.property_id=NEW.property_id
         AND resident.user_id=recipient_user
    ) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_NOTIFICATION_RECIPIENT_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_lease_unique;

ALTER TABLE lease_settlement_checkpoints
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoints_lease_code_unique,
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoints_lease_sequence_unique,
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoints_policy_code_unique,
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoints_policy_sequence_unique;

ALTER TABLE lease_settlement_checkpoints
  ADD CONSTRAINT lease_settlement_checkpoints_policy_code_unique
    UNIQUE (policy_snapshot_id, checkpoint_code),
  ADD CONSTRAINT lease_settlement_checkpoints_policy_sequence_unique
    UNIQUE (policy_snapshot_id, checkpoint_sequence);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_policy_versions
  ON lease_settlement_policy_snapshots(property_id, lease_id, created_at DESC, id DESC);

COMMENT ON INDEX idx_lease_settlement_policy_versions IS
  'Version timeline; lease_contract_settlements.policy_snapshot_id identifies the current authority.';

COMMIT;
