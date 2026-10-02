-- Planned dates remain available for scheduling. No historical period is shifted.
BEGIN;

ALTER TABLE leases ADD COLUMN IF NOT EXISTS planned_start_date DATE;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS service_period_state TEXT NOT NULL DEFAULT 'legacy';
UPDATE leases SET planned_start_date=start_date WHERE planned_start_date IS NULL;
UPDATE leases lease SET service_period_state='pending_check_in'
 WHERE lease.service_period_state='legacy' AND lease.occupancy_id IS NULL
   AND lease.renewed_from_lease_id IS NULL
   AND (lease.lease_status='awaiting_activation' OR (
     lease.lease_status='active' AND EXISTS (
       SELECT 1 FROM lease_activation_lifecycles lifecycle
        WHERE lifecycle.lease_id=lease.id AND lifecycle.property_id=lease.property_id
          AND lifecycle.state IN ('awaiting_check_in','check_in_confirmation_required')
     )
   ));

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leases_service_period_state_check') THEN
  ALTER TABLE leases ADD CONSTRAINT leases_service_period_state_check
   CHECK (service_period_state IN ('legacy','pending_check_in','started'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION initialize_lease_service_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.planned_start_date:=COALESCE(NEW.planned_start_date,NEW.start_date);
 IF NEW.lease_status='awaiting_activation' AND NEW.occupancy_id IS NULL
    AND NEW.renewed_from_lease_id IS NULL THEN
  NEW.service_period_state:='pending_check_in';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_initialize_lease_service_period ON leases;
CREATE TRIGGER trg_initialize_lease_service_period BEFORE INSERT ON leases
 FOR EACH ROW EXECUTE FUNCTION initialize_lease_service_period();

CREATE TABLE IF NOT EXISTS lease_service_period_versions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
 sequence_number INTEGER NOT NULL CHECK (sequence_number>0),
 source TEXT NOT NULL CHECK (source IN ('physical_check_in','lease_data_correction')),
 previous_snapshot JSONB NOT NULL CHECK (jsonb_typeof(previous_snapshot)='object'),
 effective_snapshot JSONB NOT NULL CHECK (jsonb_typeof(effective_snapshot)='object'),
 checked_in_at TIMESTAMPTZ NOT NULL,
 reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 2000),
 created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 command_fingerprint TEXT NOT NULL,
 UNIQUE (lease_id,sequence_number),
 UNIQUE (property_id,command_fingerprint)
);
CREATE OR REPLACE FUNCTION guard_lease_service_period_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'LEASE_SERVICE_PERIOD_APPEND_ONLY' USING ERRCODE='check_violation';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM leases WHERE id=NEW.lease_id AND property_id=NEW.property_id) THEN
  RAISE EXCEPTION 'LEASE_SERVICE_PERIOD_SCOPE_INVALID' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lease_service_period_version_guard ON lease_service_period_versions;
CREATE TRIGGER trg_lease_service_period_version_guard BEFORE INSERT OR UPDATE OR DELETE
 ON lease_service_period_versions FOR EACH ROW EXECUTE FUNCTION guard_lease_service_period_version();

-- Issued installment authority remains immutable. Effective dates are append-only.
CREATE TABLE IF NOT EXISTS lease_service_period_installments (
 version_id UUID NOT NULL REFERENCES lease_service_period_versions(id) ON DELETE RESTRICT,
 installment_id UUID NOT NULL REFERENCES lease_installments(id) ON DELETE RESTRICT,
 coverage_start_date DATE NOT NULL,
 coverage_end_date DATE NOT NULL CHECK (coverage_end_date>=coverage_start_date),
 due_date DATE NOT NULL,
 PRIMARY KEY (version_id,installment_id)
);
CREATE OR REPLACE FUNCTION guard_lease_service_period_installment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'LEASE_SERVICE_PERIOD_APPEND_ONLY' USING ERRCODE='check_violation';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM lease_service_period_versions version JOIN lease_installments installment
   ON installment.property_id=version.property_id AND installment.lease_id=version.lease_id
   WHERE version.id=NEW.version_id AND installment.id=NEW.installment_id) THEN
  RAISE EXCEPTION 'LEASE_SERVICE_PERIOD_SCOPE_INVALID' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lease_service_period_installment_guard ON lease_service_period_installments;
CREATE TRIGGER trg_lease_service_period_installment_guard BEFORE INSERT OR UPDATE OR DELETE
 ON lease_service_period_installments FOR EACH ROW EXECUTE FUNCTION guard_lease_service_period_installment();
CREATE OR REPLACE VIEW lease_installment_effective_periods AS
 SELECT installment.id,installment.property_id,installment.lease_id,installment.invoice_id,installment.sequence_number,
  COALESCE(period.coverage_start_date,installment.coverage_start_date) AS coverage_start_date,
  COALESCE(period.coverage_end_date,installment.coverage_end_date) AS coverage_end_date,
  COALESCE(period.due_date,installment.due_date) AS due_date,
  installment.scheduled_amount,installment.installment_status
 FROM lease_installments installment
 LEFT JOIN LATERAL (
  SELECT effective.coverage_start_date,effective.coverage_end_date,effective.due_date
   FROM lease_service_period_installments effective JOIN lease_service_period_versions version ON version.id=effective.version_id
   WHERE effective.installment_id=installment.id ORDER BY version.sequence_number DESC LIMIT 1
 ) period ON true;

COMMENT ON COLUMN leases.service_period_state IS
 'pending_check_in dates are operational plans; started dates follow physical check-in; legacy dates retain historical authority.';

-- Capture pending-service provenance on newly issued proofs, never rewrite old proofs.
CREATE OR REPLACE FUNCTION capture_contract_paid_service_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pending BOOLEAN; term INTEGER;
BEGIN
 SELECT service_period_state='pending_check_in',term_months INTO pending,term
  FROM leases WHERE id=NEW.lease_id AND property_id=NEW.property_id;
 NEW.safe_snapshot:=NEW.safe_snapshot || jsonb_build_object('servicePeriodPending',COALESCE(pending,false),'leaseTermMonths',term);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_capture_contract_paid_service_period ON lease_contract_paid_documents;
CREATE TRIGGER trg_capture_contract_paid_service_period BEFORE INSERT ON lease_contract_paid_documents
 FOR EACH ROW EXECUTE FUNCTION capture_contract_paid_service_period();

CREATE OR REPLACE VIEW resident_admin_lifecycle_projection AS
SELECT resident.id AS resident_id,
       resident.property_id,
       COALESCE(current_lease.authority_count,0)::integer AS lease_authority_count,
       CASE WHEN current_lease.authority_count=1 THEN current_lease.room_number
            WHEN current_lease.id IS NULL THEN historical_lease.room_number END AS room_number,
       CASE WHEN current_lease.authority_count=1 THEN current_lease.start_date
            WHEN current_lease.id IS NULL THEN historical_lease.start_date END AS lease_start,
       CASE WHEN current_lease.authority_count=1 THEN current_lease.end_date
            WHEN current_lease.id IS NULL THEN historical_lease.end_date END AS lease_end,
       chosen_lease.id AS projected_lease_id,
       chosen_lease.lease_status AS projected_lease_status,
       CASE
         WHEN preactivation_cancellation.refund_id IS NOT NULL THEN 'reversed_refunded'
         WHEN exit_financial.amount_due>0 THEN 'outstanding_balance'
         WHEN settlement.state='paid' OR financial.remaining_amount=0 THEN 'paid_in_full'
         WHEN pending_payment.pending_amount>0 THEN 'pending_verification'
         WHEN reversal_history.has_reversal
              AND financial.verified_rent_credit=0 THEN 'reversed_refunded'
         WHEN financial.verified_rent_credit=chosen_lease.snapshot_monthly_price
              AND financial.remaining_amount>0 THEN 'initial_month_payment'
          WHEN COALESCE(commitment.dp_verified_amount,0)>0
               AND financial.verified_rent_credit<=COALESCE(payment_commitment.rent_credit_amount,0)
            THEN 'down_payment'
          WHEN COALESCE(commitment.booking_fee_paid_amount,0)>0
               AND financial.verified_rent_credit<=COALESCE(payment_commitment.rent_credit_amount,0)
           THEN 'booking_fee'
         WHEN financial.verified_rent_credit>0 THEN 'partial_payment'
         ELSE 'none'
       END::text AS rent_payment_status,
       CASE
         WHEN preactivation_cancellation.refund_id IS NOT NULL
              OR (resident.resident_status='archived' AND chosen_lease.lease_status='cancelled')
           THEN 'preactivation_cancelled'
         WHEN termination.id IS NOT NULL OR settlement.state='termination_pending'
           THEN 'termination_pending'
         WHEN settlement.state='paid' OR financial.remaining_amount=0 THEN 'paid_in_full'
         WHEN exit_financial.decision_status IN ('amount_due','refund_pending')
           THEN 'admin_action_required'
         WHEN EXISTS(SELECT 1 FROM leases pending WHERE pending.id=chosen_lease.id AND pending.service_period_state='pending_check_in') THEN 'awaiting_activation'
         WHEN settlement.policy_snapshot_id IS NOT NULL THEN
           CASE WHEN v2.contract_settlement_stage='termination_eligible'
                THEN 'admin_action_required'
                ELSE COALESCE(v2.contract_settlement_stage,'admin_action_required') END
         WHEN settlement.state='awaiting_activation' OR chosen_lease.lease_status='awaiting_activation'
           THEN 'awaiting_activation'
         WHEN settlement.id IS NULL THEN 'none'
         WHEN now()>COALESCE(settlement.extension_due_at,settlement.original_due_at)+INTERVAL '7 days'
           THEN 'admin_action_required'
         WHEN settlement.extension_due_at IS NOT NULL AND now()<=settlement.extension_due_at
           THEN 'extended'
         WHEN now()>COALESCE(settlement.extension_due_at,settlement.original_due_at)
              AND now()<=COALESCE(settlement.extension_due_at,settlement.original_due_at)+INTERVAL '3 days'
           THEN 'overdue_grace'
         WHEN now()>COALESCE(settlement.extension_due_at,settlement.original_due_at)
           THEN 'overdue'
         ELSE 'final_settlement_due'
       END::text AS contract_settlement_stage,
       CASE
         WHEN preactivation_cancellation.refund_id IS NOT NULL
              OR EXISTS(SELECT 1 FROM leases pending WHERE pending.id=chosen_lease.id AND pending.service_period_state='pending_check_in') THEN NULL
         WHEN settlement.policy_snapshot_id IS NOT NULL
           THEN to_char(v2.effective_due_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD')
         ELSE to_char(COALESCE(settlement.extension_due_at,settlement.original_due_at)
                      AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD')
       END AS contract_settlement_due_date,
       COALESCE(financial.remaining_amount,0)::bigint AS contract_settlement_remaining_amount,
       COALESCE(v2.checkpoint_required_amount,0)::bigint
         AS contract_settlement_checkpoint_required_amount,
       (
         current_lease.authority_count=1
         AND current_lease.lease_status='active'
         AND current_lease.end_date<(now() AT TIME ZONE 'Asia/Jakarta')::date
       ) AS lease_expired_admin_action_required
  FROM residents resident
  LEFT JOIN LATERAL (
    SELECT lease.id,lease.lease_status,
           CASE WHEN lease.service_period_state='pending_check_in' THEN NULL ELSE lease.start_date END AS start_date,
           CASE WHEN lease.service_period_state='pending_check_in' THEN NULL ELSE lease.end_date END AS end_date,
           lease.snapshot_monthly_price,lease.contract_rent_amount,
           lease.onboarding_commitment_id,lease.booking_lead_id,room.number AS room_number,
           count(*) OVER()::integer AS authority_count
      FROM leases lease
      JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
     WHERE lease.resident_id=resident.id
       AND lease.property_id=resident.property_id
       AND lease.lease_status IN ('awaiting_activation','active')
     ORDER BY CASE lease.lease_status WHEN 'active' THEN 0 ELSE 1 END,
              lease.created_at DESC,lease.id DESC
     LIMIT 1
  ) current_lease ON true
  LEFT JOIN LATERAL (
    SELECT lease.id,lease.lease_status,lease.start_date,lease.end_date,
           lease.snapshot_monthly_price,lease.contract_rent_amount,
           lease.onboarding_commitment_id,lease.booking_lead_id,room.number AS room_number
      FROM leases lease
      JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
     WHERE current_lease.id IS NULL
       AND lease.resident_id=resident.id
       AND lease.property_id=resident.property_id
       AND lease.lease_status IN ('completed','ended','cancelled','transferred')
     ORDER BY lease.closed_at DESC NULLS LAST,lease.updated_at DESC,lease.id DESC
     LIMIT 1
  ) historical_lease ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN current_lease.authority_count=1 THEN current_lease.id
                WHEN current_lease.id IS NULL THEN historical_lease.id END AS id,
           CASE WHEN current_lease.authority_count=1 THEN current_lease.lease_status
                WHEN current_lease.id IS NULL THEN historical_lease.lease_status END AS lease_status,
           CASE WHEN current_lease.authority_count=1 THEN current_lease.snapshot_monthly_price
                WHEN current_lease.id IS NULL THEN historical_lease.snapshot_monthly_price END
             AS snapshot_monthly_price,
           CASE WHEN current_lease.authority_count=1 THEN current_lease.contract_rent_amount
                WHEN current_lease.id IS NULL THEN historical_lease.contract_rent_amount END
             AS contract_rent_amount,
           CASE WHEN current_lease.authority_count=1 THEN current_lease.onboarding_commitment_id
                WHEN current_lease.id IS NULL THEN historical_lease.onboarding_commitment_id END
             AS onboarding_commitment_id,
           CASE WHEN current_lease.authority_count=1 THEN current_lease.booking_lead_id
                WHEN current_lease.id IS NULL THEN historical_lease.booking_lead_id END
             AS booking_lead_id
  ) chosen_lease ON true
  LEFT JOIN onboarding_commitments commitment
    ON commitment.id=chosen_lease.onboarding_commitment_id
    AND commitment.property_id=resident.property_id
    AND commitment.resident_id=resident.id
  LEFT JOIN booking_lead_payment_commitments payment_commitment
    ON payment_commitment.booking_lead_id=chosen_lease.booking_lead_id
   AND payment_commitment.property_id=resident.property_id
  LEFT JOIN lease_contract_settlements settlement
    ON settlement.lease_id=chosen_lease.id AND settlement.property_id=resident.property_id
  LEFT JOIN lease_settlement_v2_current_projection v2
    ON v2.settlement_id=settlement.id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(invoice.credit_amount+COALESCE(allocation.net,0)),0)::bigint
             AS verified_rent_credit,
           GREATEST(COALESCE(chosen_lease.contract_rent_amount,0)
                    -COALESCE(sum(invoice.credit_amount+COALESCE(allocation.net,0)),0),0)::bigint
             AS remaining_amount
      FROM invoices invoice
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
               -COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
          FROM payment_allocations payment_allocation
          LEFT JOIN payment_reversal_allocations reversal_allocation
            ON reversal_allocation.original_allocation_id=payment_allocation.id
         WHERE payment_allocation.invoice_id=invoice.id
      ) allocation ON true
     WHERE invoice.property_id=resident.property_id
       AND invoice.lease_id=chosen_lease.id
       AND invoice.invoice_purpose='rent'
       AND invoice.invoice_status<>'void'
  ) financial ON chosen_lease.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(payment.amount),0)::bigint AS pending_amount
      FROM payments payment
     WHERE payment.property_id=resident.property_id
       AND payment.lease_id=chosen_lease.id
       AND payment.payment_status='pending_confirmation'
  ) pending_payment ON chosen_lease.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT EXISTS(
      SELECT 1 FROM payment_reversals reversal
      JOIN payments payment ON payment.id=reversal.payment_id
       WHERE reversal.property_id=resident.property_id
         AND payment.lease_id=chosen_lease.id
    ) AS has_reversal
  ) reversal_history ON chosen_lease.id IS NOT NULL
  LEFT JOIN lease_termination_cases termination
    ON termination.settlement_id=settlement.id AND termination.status='pending'
  LEFT JOIN LATERAL (
    SELECT final_settlement.amount_due,final_settlement.decision_status
      FROM lease_exit_final_settlements final_settlement
     WHERE final_settlement.property_id=resident.property_id
       AND final_settlement.lease_id=chosen_lease.id
     ORDER BY final_settlement.approved_at DESC,final_settlement.id DESC
     LIMIT 1
  ) exit_financial ON chosen_lease.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT refund.id AS refund_id
      FROM booking_lead_payment_commitment_refunds refund
     WHERE refund.property_id=resident.property_id
       AND refund.booking_lead_id=chosen_lease.booking_lead_id
     ORDER BY refund.refunded_at DESC,refund.id DESC
     LIMIT 1
  ) preactivation_cancellation ON chosen_lease.id IS NOT NULL;
COMMIT;
