-- Align every open V4 contract with the product-owner checkpoint window and
-- allow Admin to revise a negotiated final deadline more than once. Existing
-- payments and issued documents are never deleted or rewritten.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL
     OR to_regclass('public.lease_settlement_checkpoint_due_date_overrides') IS NULL
     OR to_regclass('public.lease_settlement_extensions') IS NULL THEN
    RAISE EXCEPTION 'EDITABLE_CONTRACT_SETTLEMENT_DEADLINE_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS lease_settlement_deadline_alignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  policy_snapshot_id UUID NOT NULL REFERENCES lease_settlement_policy_snapshots(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  previous_offset_months SMALLINT NOT NULL,
  revised_offset_months SMALLINT NOT NULL,
  previous_effective_due_at TIMESTAMPTZ NOT NULL,
  revised_effective_due_at TIMESTAMPTZ NOT NULL,
  revision_reason TEXT NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_deadline_alignment_history_lease
  ON lease_settlement_deadline_alignment_history(property_id, lease_id, revised_at DESC);

CREATE TABLE IF NOT EXISTS lease_settlement_extension_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  extension_id UUID NOT NULL REFERENCES lease_settlement_extensions(id) ON DELETE RESTRICT,
  previous_due_at TIMESTAMPTZ NOT NULL,
  revised_due_at TIMESTAMPTZ NOT NULL,
  previous_reason TEXT NOT NULL,
  revised_reason TEXT NOT NULL,
  revised_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_extension_edit_history_lease
  ON lease_settlement_extension_edit_history(property_id, lease_id, revised_at DESC);

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_policy_immutable
  ON lease_settlement_policy_snapshots;
DROP TRIGGER IF EXISTS trg_lease_settlement_checkpoint_due_date_override_immutable
  ON lease_settlement_checkpoint_due_date_overrides;

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_deadline_check;

WITH targets AS (
  SELECT snapshot.property_id,
         snapshot.lease_id,
         snapshot.id AS policy_snapshot_id,
         checkpoint.id AS checkpoint_id,
         snapshot.final_settlement_offset_months AS previous_offset_months,
         LEAST(snapshot.term_months, 3)::smallint AS revised_offset_months,
         COALESCE(override.effective_due_at, checkpoint.due_at) AS previous_effective_due_at,
         ((uniform_rent_due_date_15(
             (lease.start_date + make_interval(months => LEAST(snapshot.term_months, 3)))::date
           ) + 1 + TIME '00:00' - INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta')
           AS revised_effective_due_at
    FROM lease_settlement_policy_snapshots snapshot
    JOIN leases lease ON lease.id=snapshot.lease_id AND lease.property_id=snapshot.property_id
    JOIN lease_contract_settlements settlement
      ON settlement.policy_snapshot_id=snapshot.id
     AND settlement.lease_id=snapshot.lease_id
     AND settlement.property_id=snapshot.property_id
    JOIN lease_settlement_checkpoints checkpoint
      ON checkpoint.policy_snapshot_id=snapshot.id
     AND checkpoint.checkpoint_code='final_settlement'
    LEFT JOIN lease_settlement_checkpoint_due_date_overrides override
      ON override.checkpoint_id=checkpoint.id AND override.property_id=checkpoint.property_id
   WHERE snapshot.policy_version='lease_settlement_v4'
     AND settlement.state IN ('awaiting_activation','open','termination_pending')
), recorded AS (
  INSERT INTO lease_settlement_deadline_alignment_history(
    property_id,lease_id,policy_snapshot_id,checkpoint_id,
    previous_offset_months,revised_offset_months,
    previous_effective_due_at,revised_effective_due_at,revision_reason
  )
  SELECT property_id,lease_id,policy_snapshot_id,checkpoint_id,
         previous_offset_months,revised_offset_months,
         previous_effective_due_at,revised_effective_due_at,
         'align_final_deadline_to_checkpoint_window'
    FROM targets
   WHERE previous_offset_months IS DISTINCT FROM revised_offset_months
      OR previous_effective_due_at IS DISTINCT FROM revised_effective_due_at
  RETURNING checkpoint_id
)
INSERT INTO lease_settlement_checkpoint_due_date_overrides(
  property_id,lease_id,checkpoint_id,original_due_at,effective_due_at,reason
)
SELECT target.property_id,target.lease_id,target.checkpoint_id,checkpoint.due_at,
       target.revised_effective_due_at,'contract_final_deadline_policy_correction'
  FROM targets target
  JOIN recorded ON recorded.checkpoint_id=target.checkpoint_id
  JOIN lease_settlement_checkpoints checkpoint ON checkpoint.id=target.checkpoint_id
ON CONFLICT(checkpoint_id) DO UPDATE SET
  effective_due_at=EXCLUDED.effective_due_at,
  reason=EXCLUDED.reason,
  adopted_at=now();

UPDATE lease_settlement_policy_snapshots snapshot
   SET final_settlement_offset_months=LEAST(snapshot.term_months, 3)
 WHERE snapshot.policy_version='lease_settlement_v4'
   AND snapshot.final_settlement_offset_months IS DISTINCT FROM LEAST(snapshot.term_months, 3);

ALTER TABLE lease_settlement_policy_snapshots
  ADD CONSTRAINT lease_settlement_policy_snapshots_deadline_check CHECK (
    (policy_version = 'lease_settlement_v2' AND (
      (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months IN (6,12) AND final_settlement_offset_months = 3)
    ))
    OR (policy_version = 'lease_settlement_v3' AND (
      (term_months = 1 AND final_settlement_offset_months = 0)
      OR (term_months = 2 AND final_settlement_offset_months = 1)
      OR (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months BETWEEN 4 AND 120 AND final_settlement_offset_months = 3)
    ))
    OR (policy_version = 'lease_settlement_v4' AND (
      (term_months = 1 AND final_settlement_offset_months = 1)
      OR (term_months = 2 AND final_settlement_offset_months = 2)
      OR (term_months BETWEEN 3 AND 120 AND final_settlement_offset_months = 3)
    ))
  );

ALTER TABLE lease_contract_settlements
  DROP CONSTRAINT IF EXISTS lease_contract_settlements_extension_check;
ALTER TABLE lease_contract_settlements
  ADD CONSTRAINT lease_contract_settlements_extension_check CHECK (
    (extension_due_at IS NULL AND extension_reason IS NULL AND extension_granted_at IS NULL
      AND extension_granted_by_user_id IS NULL)
    OR (extension_due_at IS NOT NULL
      AND char_length(trim(extension_reason)) BETWEEN 3 AND 1000
      AND extension_granted_at IS NOT NULL
      AND extension_granted_by_user_id IS NOT NULL)
  );

ALTER TABLE lease_settlement_extensions
  DROP CONSTRAINT IF EXISTS lease_settlement_extensions_deadline_check;

CREATE OR REPLACE FUNCTION record_lease_settlement_extension_edit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.extension_due_at IS DISTINCT FROM NEW.extension_due_at
     OR OLD.reason IS DISTINCT FROM NEW.reason THEN
    INSERT INTO lease_settlement_extension_edit_history(
      property_id,lease_id,extension_id,previous_due_at,revised_due_at,
      previous_reason,revised_reason,revised_by_user_id
    ) VALUES(
      NEW.property_id,NEW.lease_id,OLD.id,OLD.extension_due_at,NEW.extension_due_at,
      OLD.reason,NEW.reason,NEW.granted_by_user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_extension_scope ON lease_settlement_extensions;
CREATE TRIGGER trg_lease_settlement_v2_extension_scope
  BEFORE INSERT OR UPDATE ON lease_settlement_extensions
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_v2_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_extension_immutable ON lease_settlement_extensions;
CREATE TRIGGER trg_lease_settlement_v2_extension_immutable
  BEFORE DELETE ON lease_settlement_extensions
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();

DROP TRIGGER IF EXISTS trg_lease_settlement_extension_edit_history ON lease_settlement_extensions;
CREATE TRIGGER trg_lease_settlement_extension_edit_history
  BEFORE UPDATE ON lease_settlement_extensions
  FOR EACH ROW EXECUTE FUNCTION record_lease_settlement_extension_edit();

CREATE TRIGGER trg_lease_settlement_v2_policy_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();
CREATE TRIGGER trg_lease_settlement_checkpoint_due_date_override_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_checkpoint_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_checkpoint_due_date_override_history();

COMMENT ON TABLE lease_settlement_extension_edit_history IS
  'Append-only Admin audit history for every negotiated contract settlement deadline revision.';

COMMIT;
