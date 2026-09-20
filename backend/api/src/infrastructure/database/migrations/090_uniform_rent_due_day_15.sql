-- Uniform contract-rent due day authority.
-- New contracts and every still-open settlement use the first 15th on or after
-- the coverage they settle. Issued invoices and receipt snapshots remain
-- historical; only open scheduling authority is transitioned.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.lease_installments') IS NULL
     OR to_regclass('public.invoices') IS NULL
     OR to_regclass('public.lease_contract_settlements') IS NULL
     OR to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL THEN
    RAISE EXCEPTION 'UNIFORM_RENT_DUE_DAY_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION uniform_rent_due_date_15(coverage_start_date DATE)
RETURNS DATE LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN EXTRACT(DAY FROM coverage_start_date) <= 15
      THEN date_trunc('month', coverage_start_date)::date + 14
    ELSE (date_trunc('month', coverage_start_date) + INTERVAL '1 month')::date + 14
  END;
$$;

CREATE TABLE IF NOT EXISTS lease_uniform_rent_due_day_adoptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  due_day SMALLINT NOT NULL DEFAULT 15,
  transition_due_date DATE NOT NULL,
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_uniform_rent_due_day_adoptions_lease_unique UNIQUE (lease_id),
  CONSTRAINT lease_uniform_rent_due_day_adoptions_day_check CHECK (due_day = 15)
);

CREATE INDEX IF NOT EXISTS idx_lease_uniform_rent_due_day_adoptions_property
  ON lease_uniform_rent_due_day_adoptions(property_id, transition_due_date);

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_version_check,
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_term_check,
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_deadline_check;

ALTER TABLE lease_settlement_policy_snapshots
  ADD CONSTRAINT lease_settlement_policy_snapshots_version_check CHECK (
    policy_version IN ('lease_settlement_v2', 'lease_settlement_v3', 'lease_settlement_v4')
  ),
  ADD CONSTRAINT lease_settlement_policy_snapshots_term_check CHECK (
    (policy_version = 'lease_settlement_v2' AND term_months IN (3, 6, 12))
    OR (policy_version IN ('lease_settlement_v3', 'lease_settlement_v4') AND term_months BETWEEN 1 AND 120)
  ),
  ADD CONSTRAINT lease_settlement_policy_snapshots_deadline_check CHECK (
    (policy_version = 'lease_settlement_v2' AND (
      (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months IN (6, 12) AND final_settlement_offset_months = 3)
    ))
    OR (policy_version = 'lease_settlement_v3' AND (
      (term_months = 1 AND final_settlement_offset_months = 0)
      OR (term_months = 2 AND final_settlement_offset_months = 1)
      OR (term_months = 3 AND final_settlement_offset_months = 2)
      OR (term_months BETWEEN 4 AND 120 AND final_settlement_offset_months = 3)
    ))
    OR (policy_version = 'lease_settlement_v4'
      AND final_settlement_offset_months = term_months - 1)
  );

CREATE OR REPLACE FUNCTION validate_lease_settlement_v2_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lease_property UUID;
  snapshot_property UUID;
  snapshot_lease UUID;
  snapshot_policy_version TEXT;
  checkpoint_property UUID;
  checkpoint_lease UUID;
  checkpoint_snapshot UUID;
  checkpoint_due_at TIMESTAMPTZ;
  checkpoint_adopted_due_at TIMESTAMPTZ;
  snapshot_term_months SMALLINT;
  snapshot_monthly_rent_amount BIGINT;
  expected_final_sequence SMALLINT;
BEGIN
  IF TG_TABLE_NAME = 'lease_settlement_policy_snapshots' THEN
    SELECT property_id INTO lease_property FROM leases WHERE id = NEW.lease_id;
    IF lease_property IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_POLICY_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_contract_settlements' THEN
    IF NEW.policy_snapshot_id IS NULL THEN RETURN NEW; END IF;
    SELECT property_id, lease_id, policy_version, term_months
      INTO snapshot_property, snapshot_lease, snapshot_policy_version, snapshot_term_months
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_POLICY_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
         SELECT 1 FROM lease_settlement_checkpoints
          WHERE policy_snapshot_id = NEW.policy_snapshot_id
            AND checkpoint_code = 'final_settlement'
       ) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_CHECKPOINT_SCHEDULE_INCOMPLETE'
        USING ERRCODE = 'check_violation';
    END IF;
    IF snapshot_policy_version = 'lease_settlement_v2' THEN
      IF NOT EXISTS (
           SELECT 1 FROM lease_settlement_checkpoints
            WHERE policy_snapshot_id = NEW.policy_snapshot_id
              AND checkpoint_code = 'checkpoint_1'
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
    ELSIF snapshot_term_months <= 2 THEN
      IF EXISTS (
        SELECT 1 FROM lease_settlement_checkpoints
        WHERE policy_snapshot_id = NEW.policy_snapshot_id
          AND checkpoint_code IN ('checkpoint_1', 'checkpoint_2')
      ) THEN
        RAISE EXCEPTION 'LEASE_SETTLEMENT_V3_CHECKPOINT_SCHEDULE_INCOMPLETE'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF snapshot_term_months = 3 THEN
      IF NOT EXISTS (
           SELECT 1 FROM lease_settlement_checkpoints
            WHERE policy_snapshot_id = NEW.policy_snapshot_id
              AND checkpoint_code = 'checkpoint_1'
         ) OR EXISTS (
           SELECT 1 FROM lease_settlement_checkpoints
            WHERE policy_snapshot_id = NEW.policy_snapshot_id
              AND checkpoint_code = 'checkpoint_2'
         ) THEN
        RAISE EXCEPTION 'LEASE_SETTLEMENT_V3_CHECKPOINT_SCHEDULE_INCOMPLETE'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NOT EXISTS (
       SELECT 1 FROM lease_settlement_checkpoints
        WHERE policy_snapshot_id = NEW.policy_snapshot_id
          AND checkpoint_code = 'checkpoint_1'
    ) OR NOT EXISTS (
       SELECT 1 FROM lease_settlement_checkpoints
        WHERE policy_snapshot_id = NEW.policy_snapshot_id
          AND checkpoint_code = 'checkpoint_2'
    ) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_V3_CHECKPOINT_SCHEDULE_INCOMPLETE'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_settlement_checkpoints' THEN
    SELECT property_id, lease_id, policy_version, term_months, monthly_rent_amount
      INTO snapshot_property, snapshot_lease, snapshot_policy_version,
           snapshot_term_months, snapshot_monthly_rent_amount
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_CHECKPOINT_SCOPE_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    expected_final_sequence := CASE
      WHEN snapshot_policy_version = 'lease_settlement_v2' AND snapshot_term_months = 3 THEN 2
      WHEN snapshot_policy_version = 'lease_settlement_v2' THEN 3
      WHEN snapshot_term_months <= 2 THEN 1
      WHEN snapshot_term_months = 3 THEN 2
      ELSE 3
    END;
    IF (NEW.checkpoint_code = 'checkpoint_1' AND snapshot_term_months < 3)
       OR (NEW.checkpoint_code = 'checkpoint_2' AND (
         (snapshot_policy_version = 'lease_settlement_v2' AND snapshot_term_months NOT IN (6, 12))
         OR (snapshot_policy_version IN ('lease_settlement_v3', 'lease_settlement_v4') AND snapshot_term_months < 4)
       ))
       OR (NEW.checkpoint_code = 'final_settlement'
           AND NEW.checkpoint_sequence <> expected_final_sequence)
       OR (NEW.checkpoint_code = 'checkpoint_1'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 2)
       OR (NEW.checkpoint_code = 'checkpoint_2'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 3)
       OR (snapshot_policy_version = 'lease_settlement_v4'
           AND EXTRACT(DAY FROM NEW.due_at AT TIME ZONE 'Asia/Jakarta') <> 15) THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_CHECKPOINT_POLICY_INVALID'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'lease_settlement_extensions' THEN
    SELECT property_id, lease_id
      INTO snapshot_property, snapshot_lease
      FROM lease_settlement_policy_snapshots
     WHERE id = NEW.policy_snapshot_id;
    SELECT checkpoint.property_id, checkpoint.lease_id, checkpoint.policy_snapshot_id,
           checkpoint.due_at, due_override.effective_due_at
      INTO checkpoint_property, checkpoint_lease, checkpoint_snapshot, checkpoint_due_at,
           checkpoint_adopted_due_at
      FROM lease_settlement_checkpoints checkpoint
      LEFT JOIN lease_settlement_checkpoint_due_date_overrides due_override
        ON due_override.checkpoint_id = checkpoint.id
       AND due_override.property_id = checkpoint.property_id
     WHERE checkpoint.id = NEW.checkpoint_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_property IS DISTINCT FROM NEW.property_id
       OR checkpoint_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_snapshot IS DISTINCT FROM NEW.policy_snapshot_id
       OR COALESCE(checkpoint_adopted_due_at, checkpoint_due_at) IS DISTINCT FROM NEW.original_due_at THEN
      RAISE EXCEPTION 'LEASE_SETTLEMENT_EXTENSION_SCOPE_INVALID'
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
    RAISE EXCEPTION 'LEASE_SETTLEMENT_EVENT_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Only open contracts adopt the new policy. Completed settlement records and
-- all issued documents retain the date that was true when they were recorded.
INSERT INTO lease_uniform_rent_due_day_adoptions(
  property_id, lease_id, transition_due_date
)
SELECT lease.property_id,
       lease.id,
       uniform_rent_due_date_15((now() AT TIME ZONE 'Asia/Jakarta')::date)
 FROM leases lease
 LEFT JOIN lease_contract_settlements settlement
   ON settlement.lease_id = lease.id AND settlement.property_id = lease.property_id
WHERE lease.lease_status IN ('awaiting_activation', 'active')
  AND (settlement.id IS NULL OR settlement.state IN ('awaiting_activation', 'open', 'termination_pending'))
ON CONFLICT (lease_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS lease_settlement_checkpoint_due_date_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  original_due_at TIMESTAMPTZ NOT NULL,
  effective_due_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'uniform_rent_due_day_adoption',
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_checkpoint_due_date_overrides_checkpoint_unique UNIQUE (checkpoint_id),
  CONSTRAINT lease_settlement_checkpoint_due_date_overrides_effective_check CHECK (
    effective_due_at >= original_due_at OR reason = 'uniform_rent_due_day_adoption'
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_checkpoint_due_overrides_property_due
  ON lease_settlement_checkpoint_due_date_overrides(property_id, effective_due_at);

CREATE OR REPLACE FUNCTION validate_lease_settlement_checkpoint_due_date_override_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  checkpoint_property UUID;
  checkpoint_lease UUID;
BEGIN
  SELECT property_id, lease_id
    INTO checkpoint_property, checkpoint_lease
    FROM lease_settlement_checkpoints
   WHERE id = NEW.checkpoint_id;
  IF checkpoint_property IS DISTINCT FROM NEW.property_id
     OR checkpoint_lease IS DISTINCT FROM NEW.lease_id THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_DUE_DATE_OVERRIDE_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_lease_settlement_checkpoint_due_date_override_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEASE_SETTLEMENT_DUE_DATE_OVERRIDE_IMMUTABLE'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_settlement_checkpoint_due_date_override_scope
  ON lease_settlement_checkpoint_due_date_overrides;
CREATE TRIGGER trg_lease_settlement_checkpoint_due_date_override_scope
  BEFORE INSERT ON lease_settlement_checkpoint_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_checkpoint_due_date_override_scope();

DROP TRIGGER IF EXISTS trg_lease_settlement_checkpoint_due_date_override_immutable
  ON lease_settlement_checkpoint_due_date_overrides;
CREATE TRIGGER trg_lease_settlement_checkpoint_due_date_override_immutable
  BEFORE UPDATE OR DELETE ON lease_settlement_checkpoint_due_date_overrides
  FOR EACH ROW EXECUTE FUNCTION protect_lease_settlement_checkpoint_due_date_override_history();

CREATE OR REPLACE VIEW lease_settlement_v2_current_projection AS
WITH contract_ledger AS (
  SELECT invoice.property_id, invoice.lease_id,
         COALESCE(sum(invoice.credit_amount + COALESCE(allocation.net,0)),0) AS verified_rent_credit
    FROM invoices invoice
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(payment_allocation.allocated_amount
               - COALESCE(reversal.reversed_amount,0)),0) AS net
        FROM payment_allocations payment_allocation
        LEFT JOIN LATERAL (
          SELECT COALESCE(sum(reversal_allocation.reversed_amount),0) AS reversed_amount
            FROM payment_reversal_allocations reversal_allocation
           WHERE reversal_allocation.original_allocation_id=payment_allocation.id
        ) reversal ON true
       WHERE payment_allocation.invoice_id=invoice.id
    ) allocation ON true
   WHERE invoice.invoice_purpose='rent'
     AND invoice.authority_source='contract_schedule'
     AND invoice.invoice_status<>'void'
   GROUP BY invoice.property_id,invoice.lease_id
), checkpoint_evaluation AS (
  SELECT settlement.property_id,settlement.lease_id,settlement.id AS settlement_id,
         settlement.state,checkpoint.id AS checkpoint_id,checkpoint.checkpoint_code,
         checkpoint.checkpoint_sequence,checkpoint.due_at,
         due_override.effective_due_at AS adopted_due_at,
         extension.extension_due_at,extension.reason AS extension_reason,
         lease.contract_rent_amount,
         COALESCE(contract_ledger.verified_rent_credit,0) AS verified_rent_credit,
         GREATEST(lease.contract_rent_amount-COALESCE(contract_ledger.verified_rent_credit,0),0)
           AS outstanding_amount,
         CASE WHEN checkpoint.settlement_mode='exact_remaining_balance'
              THEN GREATEST(lease.contract_rent_amount-COALESCE(contract_ledger.verified_rent_credit,0),0)
              ELSE GREATEST(checkpoint.minimum_required_amount
                     - COALESCE(contract_ledger.verified_rent_credit,0),0)
         END AS shortfall_amount,
         CASE WHEN checkpoint.settlement_mode='exact_remaining_balance'
              THEN GREATEST(lease.contract_rent_amount-COALESCE(contract_ledger.verified_rent_credit,0),0)
              ELSE checkpoint.minimum_required_amount
         END AS required_amount,
         EXISTS(
           SELECT 1 FROM lease_termination_cases termination
            WHERE termination.settlement_id=settlement.id AND termination.status='pending'
         ) AS termination_pending
    FROM lease_contract_settlements settlement
    JOIN leases lease ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
    JOIN lease_settlement_checkpoints checkpoint
      ON checkpoint.lease_id=settlement.lease_id
     AND checkpoint.property_id=settlement.property_id
     AND checkpoint.policy_snapshot_id=settlement.policy_snapshot_id
    LEFT JOIN contract_ledger
      ON contract_ledger.property_id=settlement.property_id
     AND contract_ledger.lease_id=settlement.lease_id
    LEFT JOIN lease_settlement_extensions extension
      ON extension.checkpoint_id=checkpoint.id AND extension.property_id=checkpoint.property_id
    LEFT JOIN lease_settlement_checkpoint_due_date_overrides due_override
      ON due_override.checkpoint_id=checkpoint.id AND due_override.property_id=checkpoint.property_id
   WHERE settlement.policy_snapshot_id IS NOT NULL
), selected AS (
  SELECT checkpoint_evaluation.*,
         row_number() OVER(
           PARTITION BY settlement_id
           ORDER BY
             CASE WHEN shortfall_amount>0 AND now()>COALESCE(extension_due_at,adopted_due_at,due_at) THEN 0
                  WHEN now()<=COALESCE(extension_due_at,adopted_due_at,due_at) THEN 1 ELSE 2 END,
             CASE WHEN shortfall_amount>0 AND now()>COALESCE(extension_due_at,adopted_due_at,due_at) THEN checkpoint_sequence
                  WHEN now()<=COALESCE(extension_due_at,adopted_due_at,due_at) THEN checkpoint_sequence
                  ELSE -checkpoint_sequence END
         ) AS authority_rank
    FROM checkpoint_evaluation
)
SELECT property_id,lease_id,settlement_id,checkpoint_id,checkpoint_code,
       due_at AS original_due_at,extension_due_at,extension_reason,
       COALESCE(extension_due_at,adopted_due_at,due_at) AS effective_due_at,
       contract_rent_amount,verified_rent_credit,outstanding_amount,
       required_amount AS checkpoint_required_amount,
       shortfall_amount AS checkpoint_shortfall_amount,
       CASE
         WHEN state='awaiting_activation' THEN 'awaiting_activation'
         WHEN termination_pending OR state='termination_pending' THEN 'termination_pending'
         WHEN state='paid' OR outstanding_amount=0 THEN 'paid_in_full'
         WHEN shortfall_amount=0 AND checkpoint_code='checkpoint_1' THEN 'checkpoint_one_met'
         WHEN shortfall_amount=0 AND checkpoint_code='checkpoint_2' THEN 'checkpoint_two_met'
         WHEN now()<=COALESCE(extension_due_at,adopted_due_at,due_at) AND checkpoint_code='checkpoint_1' THEN 'checkpoint_one_pending'
         WHEN now()<=COALESCE(extension_due_at,adopted_due_at,due_at) AND checkpoint_code='checkpoint_2' THEN 'checkpoint_two_pending'
         WHEN now()<=COALESCE(extension_due_at,adopted_due_at,due_at) AND checkpoint_code='final_settlement' THEN 'final_settlement_due'
         WHEN extension_due_at IS NOT NULL AND now()>COALESCE(adopted_due_at,due_at)+INTERVAL '7 days' THEN 'termination_eligible'
         WHEN extension_due_at IS NOT NULL THEN 'admin_action_required'
         WHEN now()<=COALESCE(adopted_due_at,due_at)+INTERVAL '3 days' THEN 'overdue_grace'
         WHEN now()<=COALESCE(adopted_due_at,due_at)+INTERVAL '7 days' THEN 'admin_action_required'
         ELSE 'termination_eligible'
       END AS contract_settlement_stage
  FROM selected
 WHERE authority_rank=1;

WITH checkpoint_coverage AS (
  SELECT checkpoint.id,
         adoption.transition_due_date,
         CASE checkpoint.checkpoint_code
           WHEN 'checkpoint_1' THEN (lease.start_date + INTERVAL '1 month')::date
           WHEN 'checkpoint_2' THEN (lease.start_date + INTERVAL '2 months')::date
           ELSE (lease.start_date + ((lease.term_months - 1) * INTERVAL '1 month'))::date
         END AS coverage_start_date
  FROM lease_settlement_checkpoints checkpoint
  JOIN leases lease ON lease.id = checkpoint.lease_id
  JOIN lease_uniform_rent_due_day_adoptions adoption ON adoption.lease_id = checkpoint.lease_id
)
INSERT INTO lease_settlement_checkpoint_due_date_overrides(
  property_id, lease_id, checkpoint_id, original_due_at, effective_due_at
)
SELECT checkpoint.property_id,
       checkpoint.lease_id,
       checkpoint.id,
       checkpoint.due_at,
       ((
  CASE WHEN uniform_rent_due_date_15(coverage.coverage_start_date) < (now() AT TIME ZONE 'Asia/Jakarta')::date
       THEN coverage.transition_due_date
       ELSE uniform_rent_due_date_15(coverage.coverage_start_date)
  END + 1 + TIME '00:00' - INTERVAL '1 microsecond'
) AT TIME ZONE 'Asia/Jakarta')
FROM checkpoint_coverage coverage
JOIN lease_settlement_checkpoints checkpoint ON checkpoint.id=coverage.id
ON CONFLICT (checkpoint_id) DO NOTHING;

UPDATE leases lease
SET billing_anchor_day = 15,
    next_billing_date = CASE
      WHEN uniform_rent_due_date_15(lease.next_billing_date) < (now() AT TIME ZONE 'Asia/Jakarta')::date
        THEN adoption.transition_due_date
      ELSE uniform_rent_due_date_15(lease.next_billing_date)
    END,
    updated_at = now()
FROM lease_uniform_rent_due_day_adoptions adoption
WHERE adoption.lease_id = lease.id;

INSERT INTO lease_settlement_checkpoint_events(
  property_id, lease_id, checkpoint_id, event_type, metadata
)
SELECT checkpoint.property_id,
       checkpoint.lease_id,
       checkpoint.id,
       'scheduled',
       jsonb_build_object(
         'policy_version', 'lease_settlement_v4',
         'due_day', 15,
         'transition_due_date', adoption.transition_due_date,
         'reason', 'uniform_rent_due_day_adoption'
       )
FROM lease_settlement_checkpoints checkpoint
JOIN lease_uniform_rent_due_day_adoptions adoption ON adoption.lease_id = checkpoint.lease_id;

COMMENT ON FUNCTION uniform_rent_due_date_15(DATE) IS
  'Returns the first monthly 15th on or after a rent coverage start date.';
COMMENT ON TABLE lease_uniform_rent_due_day_adoptions IS
  'One-time, append-only adoption record for the uniform 15th contract-rent due day.';

COMMIT;
