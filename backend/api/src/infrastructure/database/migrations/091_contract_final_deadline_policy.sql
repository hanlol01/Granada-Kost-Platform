-- Restore the contractual settlement window while retaining the uniform 15th
-- due day. Three-month terms settle by month two; longer terms settle by month
-- three. Existing open V4 schedules are corrected without rewriting issued
-- documents or an Admin extension that has already been granted.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL
     OR to_regclass('public.lease_settlement_checkpoint_due_date_overrides') IS NULL
     OR to_regclass('public.lease_contract_settlements') IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_FINAL_DEADLINE_POLICY_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS lease_settlement_deadline_policy_revisions (
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
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_deadline_policy_revisions_checkpoint_unique UNIQUE(checkpoint_id),
  CONSTRAINT lease_settlement_deadline_policy_revisions_offset_check CHECK (
    revised_offset_months BETWEEN 0 AND 3
  )
);

ALTER TABLE lease_settlement_checkpoint_due_date_overrides
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoint_due_date_overrides_effective_check;
ALTER TABLE lease_settlement_checkpoint_due_date_overrides
  ADD CONSTRAINT lease_settlement_checkpoint_due_date_overrides_effective_check CHECK (
    effective_due_at >= original_due_at
    OR reason IN ('uniform_rent_due_day_adoption','contract_final_deadline_policy_correction')
  );

WITH revisions AS (
  SELECT snapshot.property_id,
         snapshot.lease_id,
         snapshot.id AS policy_snapshot_id,
         checkpoint.id AS checkpoint_id,
         snapshot.final_settlement_offset_months AS previous_offset_months,
         3::smallint AS revised_offset_months,
         COALESCE(override.effective_due_at,checkpoint.due_at) AS previous_effective_due_at,
         CASE
           WHEN extension.id IS NOT NULL THEN COALESCE(override.effective_due_at,checkpoint.due_at)
           ELSE ((
             CASE
               WHEN uniform_rent_due_date_15((lease.start_date + INTERVAL '3 months')::date)
                    < (now() AT TIME ZONE 'Asia/Jakarta')::date
                 THEN adoption.transition_due_date
               ELSE uniform_rent_due_date_15((lease.start_date + INTERVAL '3 months')::date)
             END + 1 + TIME '00:00' - INTERVAL '1 microsecond'
           ) AT TIME ZONE 'Asia/Jakarta')
         END AS revised_effective_due_at
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
    LEFT JOIN lease_settlement_extensions extension
      ON extension.checkpoint_id=checkpoint.id AND extension.property_id=checkpoint.property_id
    LEFT JOIN lease_uniform_rent_due_day_adoptions adoption ON adoption.lease_id=lease.id
   WHERE snapshot.policy_version='lease_settlement_v4'
     AND snapshot.term_months>4
     AND settlement.state IN ('awaiting_activation','open','termination_pending')
)
INSERT INTO lease_settlement_deadline_policy_revisions(
  property_id,lease_id,policy_snapshot_id,checkpoint_id,
  previous_offset_months,revised_offset_months,
  previous_effective_due_at,revised_effective_due_at,revision_reason
)
SELECT property_id,lease_id,policy_snapshot_id,checkpoint_id,
       previous_offset_months,revised_offset_months,
       previous_effective_due_at,revised_effective_due_at,
       'restore_maximum_three_month_contract_settlement_window'
  FROM revisions
ON CONFLICT(checkpoint_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_lease_settlement_v2_policy_immutable
  ON lease_settlement_policy_snapshots;
DROP TRIGGER IF EXISTS trg_lease_settlement_policy_snapshots_immutable
  ON lease_settlement_policy_snapshots;
DROP TRIGGER IF EXISTS trg_lease_settlement_checkpoint_due_date_override_immutable
  ON lease_settlement_checkpoint_due_date_overrides;

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_deadline_check;

UPDATE lease_settlement_policy_snapshots snapshot
   SET final_settlement_offset_months=revision.revised_offset_months
  FROM lease_settlement_deadline_policy_revisions revision
 WHERE revision.policy_snapshot_id=snapshot.id
   AND snapshot.final_settlement_offset_months<>revision.revised_offset_months;

UPDATE lease_settlement_checkpoint_due_date_overrides override
   SET effective_due_at=revision.revised_effective_due_at,
       reason='contract_final_deadline_policy_correction'
  FROM lease_settlement_deadline_policy_revisions revision
 WHERE revision.checkpoint_id=override.checkpoint_id
   AND NOT EXISTS (
     SELECT 1 FROM lease_settlement_extensions extension
      WHERE extension.checkpoint_id=override.checkpoint_id
   )
   AND override.effective_due_at IS DISTINCT FROM revision.revised_effective_due_at;

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_deadline_check;
ALTER TABLE lease_settlement_policy_snapshots
  ADD CONSTRAINT lease_settlement_policy_snapshots_deadline_check CHECK (
    (policy_version = 'lease_settlement_v2' AND (
      (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months IN (6,12) AND final_settlement_offset_months = 3)
    ))
    OR (policy_version IN ('lease_settlement_v3','lease_settlement_v4') AND (
      (term_months = 1 AND final_settlement_offset_months = 0)
      OR (term_months = 2 AND final_settlement_offset_months = 1)
      OR (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months BETWEEN 4 AND 120 AND final_settlement_offset_months = 3)
    ))
  );

CREATE TRIGGER trg_lease_settlement_v2_policy_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_policy_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_v2_history();
CREATE TRIGGER trg_lease_settlement_checkpoint_due_date_override_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_checkpoint_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_checkpoint_due_date_override_history();

COMMENT ON TABLE lease_settlement_deadline_policy_revisions IS
  'Append-only evidence for the V4 final-settlement deadline correction; granted Admin extensions remain authoritative.';

COMMIT;
