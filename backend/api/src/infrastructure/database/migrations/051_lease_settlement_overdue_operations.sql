-- Operational records for lease-settlement overdue handling. Existing leases
-- are not backfilled; only leases carrying the v2 policy snapshot participate.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL
     OR to_regclass('public.lease_settlement_checkpoint_events') IS NULL
     OR to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_OVERDUE_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE property_feature_flags
  ADD COLUMN IF NOT EXISTS lease_settlement_scheduler BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS lease_payment_promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  policy_snapshot_id UUID NOT NULL REFERENCES lease_settlement_policy_snapshots(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  promised_amount BIGINT NOT NULL,
  promised_payment_date DATE NOT NULL,
  note TEXT NOT NULL,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_payment_promises_amount_check CHECK (promised_amount > 0),
  CONSTRAINT lease_payment_promises_note_check CHECK (
    char_length(trim(note)) BETWEEN 3 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_payment_promises_timeline
  ON lease_payment_promises(property_id, lease_id, recorded_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS lease_settlement_notification_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  checkpoint_id UUID NOT NULL REFERENCES lease_settlement_checkpoints(id) ON DELETE RESTRICT,
  notification_kind TEXT NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  trigger_business_date DATE NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_settlement_notification_ledger_unique
    UNIQUE (checkpoint_id, notification_kind, recipient_user_id),
  CONSTRAINT lease_settlement_notification_kind_check CHECK (
    notification_kind IN (
      'h_minus_7', 'h_minus_3', 'h_minus_1', 'due_today',
      'overdue_h_plus_1', 'grace_ended', 'termination_eligible',
      'extension_granted', 'extension_expiring', 'extension_expired'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_settlement_notification_ledger_property_date
  ON lease_settlement_notification_ledger(property_id, trigger_business_date, notification_kind);

ALTER TABLE lease_settlement_checkpoint_events
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_settlement_checkpoint_events_key
  ON lease_settlement_checkpoint_events(property_id, event_key)
  WHERE event_key IS NOT NULL;

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
   WHERE settlement.policy_snapshot_id IS NOT NULL
), selected AS (
  SELECT checkpoint_evaluation.*,
         row_number() OVER(
           PARTITION BY settlement_id
           ORDER BY
             CASE WHEN shortfall_amount>0 AND now()>due_at THEN 0
                  WHEN now()<=due_at THEN 1 ELSE 2 END,
             CASE WHEN shortfall_amount>0 AND now()>due_at THEN checkpoint_sequence
                  WHEN now()<=due_at THEN checkpoint_sequence
                  ELSE -checkpoint_sequence END
         ) AS authority_rank
    FROM checkpoint_evaluation
)
SELECT property_id,lease_id,settlement_id,checkpoint_id,checkpoint_code,
       due_at AS original_due_at,extension_due_at,extension_reason,
       COALESCE(extension_due_at,due_at) AS effective_due_at,
       contract_rent_amount,verified_rent_credit,outstanding_amount,
       required_amount AS checkpoint_required_amount,
       shortfall_amount AS checkpoint_shortfall_amount,
       CASE
         WHEN state='awaiting_activation' THEN 'awaiting_activation'
         WHEN termination_pending OR state='termination_pending' THEN 'termination_pending'
         WHEN state='paid' OR outstanding_amount=0 THEN 'paid_in_full'
         WHEN shortfall_amount=0 AND checkpoint_code='checkpoint_1' THEN 'checkpoint_one_met'
         WHEN shortfall_amount=0 AND checkpoint_code='checkpoint_2' THEN 'checkpoint_two_met'
         WHEN now()<=due_at AND checkpoint_code='checkpoint_1' THEN 'checkpoint_one_pending'
         WHEN now()<=due_at AND checkpoint_code='checkpoint_2' THEN 'checkpoint_two_pending'
         WHEN now()<=due_at AND checkpoint_code='final_settlement' THEN 'final_settlement_due'
         WHEN extension_due_at IS NOT NULL AND now()<=extension_due_at THEN 'extended'
         WHEN extension_due_at IS NOT NULL AND now()>due_at+INTERVAL '7 days' THEN 'termination_eligible'
         WHEN extension_due_at IS NOT NULL THEN 'admin_action_required'
         WHEN now()<=due_at+INTERVAL '3 days' THEN 'overdue_grace'
         WHEN now()<=due_at+INTERVAL '7 days' THEN 'admin_action_required'
         ELSE 'termination_eligible'
       END AS contract_settlement_stage
  FROM selected
 WHERE authority_rank=1;

ALTER TABLE lease_settlement_checkpoint_events
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoint_events_type_check;

ALTER TABLE lease_settlement_checkpoint_events
  ADD CONSTRAINT lease_settlement_checkpoint_events_type_check CHECK (
    event_type IN (
      'scheduled', 'minimum_coverage_met', 'final_settlement_required',
      'payment_reversed', 'overdue_started', 'grace_started',
      'extension_granted', 'extension_expiring', 'extension_expired',
      'admin_action_required', 'termination_eligible', 'termination_started',
      'promise_to_pay_recorded', 'settled', 'cancelled'
    )
  );

CREATE OR REPLACE FUNCTION validate_lease_settlement_overdue_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  checkpoint_property UUID;
  checkpoint_lease UUID;
  checkpoint_policy UUID;
BEGIN
  SELECT property_id, lease_id, policy_snapshot_id
    INTO checkpoint_property, checkpoint_lease, checkpoint_policy
    FROM lease_settlement_checkpoints
   WHERE id = NEW.checkpoint_id;

  IF checkpoint_property IS DISTINCT FROM NEW.property_id
     OR checkpoint_lease IS DISTINCT FROM NEW.lease_id
     OR (TG_TABLE_NAME = 'lease_payment_promises'
         AND checkpoint_policy IS DISTINCT FROM
           (to_jsonb(NEW)->>'policy_snapshot_id')::uuid) THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_OVERDUE_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'lease_settlement_notification_ledger'
     AND NOT EXISTS (
       SELECT 1
         FROM user_property_roles membership
        WHERE membership.user_id=NEW.recipient_user_id
          AND membership.property_id=NEW.property_id
          AND membership.revoked_at IS NULL
       UNION ALL
       SELECT 1
         FROM leases lease
         JOIN residents resident
           ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
        WHERE lease.id=NEW.lease_id
          AND lease.property_id=NEW.property_id
          AND resident.user_id=NEW.recipient_user_id
     ) THEN
    RAISE EXCEPTION 'LEASE_SETTLEMENT_NOTIFICATION_RECIPIENT_SCOPE_INVALID'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lease_payment_promises_scope_guard ON lease_payment_promises;
CREATE TRIGGER lease_payment_promises_scope_guard
BEFORE INSERT OR UPDATE ON lease_payment_promises
FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_overdue_scope();

DROP TRIGGER IF EXISTS lease_settlement_notification_ledger_scope_guard
  ON lease_settlement_notification_ledger;
CREATE TRIGGER lease_settlement_notification_ledger_scope_guard
BEFORE INSERT OR UPDATE ON lease_settlement_notification_ledger
FOR EACH ROW EXECUTE FUNCTION validate_lease_settlement_overdue_scope();

COMMIT;
