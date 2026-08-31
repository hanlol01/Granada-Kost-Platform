-- M7 canonical resident lifecycle/read projection. Operational resident lists,
-- historical pre-activation cancellations, payment state, settlement stage,
-- and expired-lease exceptions are derived on the server from one projection.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.residents') IS NULL
     OR to_regclass('public.leases') IS NULL
     OR to_regclass('public.lease_settlement_v2_current_projection') IS NULL
     OR to_regclass('public.booking_lead_payment_commitment_refunds') IS NULL
     OR to_regclass('public.lease_exit_final_settlements') IS NULL THEN
    RAISE EXCEPTION 'M7_RESIDENT_LIFECYCLE_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archive_source TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE residents resident
   SET resident_status='archived',
       archive_reason=COALESCE(NULLIF(trim(cancelled.refund_note),''),'Dibatalkan Pra-Aktivasi'),
       archive_source='pre_activation_cancellation',
       archived_at=cancelled.refunded_at,
       archived_by_user_id=cancelled.refunded_by_user_id,
       updated_at=GREATEST(resident.updated_at,cancelled.refunded_at)
  FROM (
    SELECT DISTINCT ON (lease.resident_id,lease.property_id)
           lease.resident_id,lease.property_id,refund.refund_note,refund.refunded_at,
           refund.refunded_by_user_id
      FROM leases lease
      JOIN booking_lead_payment_commitment_refunds refund
        ON refund.booking_lead_id=lease.booking_lead_id
       AND refund.property_id=lease.property_id
     WHERE lease.lease_status='cancelled'
     ORDER BY lease.resident_id,lease.property_id,refund.refunded_at DESC,refund.id DESC
  ) cancelled
 WHERE resident.id=cancelled.resident_id
   AND resident.property_id=cancelled.property_id
   AND resident.resident_status IN ('inactive','archived')
   AND NOT EXISTS (
     SELECT 1 FROM leases current_lease
      WHERE current_lease.resident_id=resident.id
        AND current_lease.property_id=resident.property_id
        AND current_lease.lease_status IN ('awaiting_activation','active')
   );

UPDATE residents
   SET archive_reason=COALESCE(archive_reason,'Data historis diarsipkan'),
       archive_source=COALESCE(archive_source,'historical_archive'),
       archived_at=COALESCE(archived_at,updated_at)
 WHERE resident_status='archived';

ALTER TABLE residents
  DROP CONSTRAINT IF EXISTS residents_archive_metadata_check;

ALTER TABLE residents
  ADD CONSTRAINT residents_archive_metadata_check CHECK (
    resident_status<>'archived'
    OR (
      archived_at IS NOT NULL
      AND char_length(trim(COALESCE(archive_reason,''))) BETWEEN 3 AND 1000
      AND char_length(trim(COALESCE(archive_source,''))) BETWEEN 3 AND 100
    )
  );

CREATE INDEX IF NOT EXISTS idx_residents_property_archive_time
  ON residents(property_id,archived_at DESC)
  WHERE resident_status='archived';

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
         WHEN preactivation_cancellation.refund_id IS NOT NULL THEN NULL
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
    SELECT lease.id,lease.lease_status,lease.start_date,lease.end_date,
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
