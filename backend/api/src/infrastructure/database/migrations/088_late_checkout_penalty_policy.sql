-- Replaces the operational short-notice workflow for newly created checkout
-- commands. Legacy commands keep their original policy and financial facts.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_exit_final_settlements') IS NULL THEN
    RAISE EXCEPTION 'LATE_CHECKOUT_PENALTY_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE lease_checkout_commands
  ADD COLUMN IF NOT EXISTS charge_policy TEXT NOT NULL DEFAULT 'legacy_short_notice_v1',
  ADD COLUMN IF NOT EXISTS late_checkout_grace_days INTEGER,
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_day_cap INTEGER,
  ADD COLUMN IF NOT EXISTS contract_last_occupancy_date DATE,
  ADD COLUMN IF NOT EXISTS penalty_free_until_date DATE,
  ADD COLUMN IF NOT EXISTS late_checkout_daily_penalty_amount BIGINT,
  ADD COLUMN IF NOT EXISTS late_checkout_overdue_days INTEGER,
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_days INTEGER,
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_amount BIGINT;

ALTER TABLE lease_checkout_commands
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_charge_policy_check,
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_late_penalty_snapshot_check,
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_notice_check;

ALTER TABLE lease_checkout_commands
  ADD CONSTRAINT lease_checkout_commands_charge_policy_check CHECK (
    charge_policy IN ('legacy_short_notice_v1','late_checkout_penalty_v1')
  ),
  ADD CONSTRAINT lease_checkout_commands_late_penalty_snapshot_check CHECK (
    charge_policy='legacy_short_notice_v1'
    OR (
      planned_lease_end_date IS NOT NULL
      AND late_checkout_grace_days BETWEEN 0 AND 31
      AND late_checkout_penalty_day_cap BETWEEN 1 AND 366
      AND contract_last_occupancy_date=planned_lease_end_date-1
      AND penalty_free_until_date=contract_last_occupancy_date+late_checkout_grace_days
      AND late_checkout_daily_penalty_amount > 0
      AND COALESCE(late_checkout_overdue_days,0) >= 0
      AND COALESCE(late_checkout_penalty_days,0) BETWEEN 0 AND late_checkout_penalty_day_cap
      AND COALESCE(late_checkout_penalty_amount,0)
        = late_checkout_daily_penalty_amount * COALESCE(late_checkout_penalty_days,0)
    )
  ),
  ADD CONSTRAINT lease_checkout_commands_notice_check CHECK (
    charge_policy='late_checkout_penalty_v1'
    OR (
      effective_date >= notice_recorded_date
      AND (
        effective_date >= notice_recorded_date + 14
        OR char_length(trim(COALESCE(notice_exception_reason,''))) BETWEEN 1 AND 2000
      )
    )
  );

COMMENT ON COLUMN lease_checkout_commands.charge_policy IS
  'Immutable checkout charge policy. Legacy short notice remains historical; new commands use late checkout penalty.';
COMMENT ON COLUMN lease_checkout_commands.penalty_free_until_date IS
  'Last Jakarta business date on which physical room and key return incurs no late checkout penalty.';

ALTER TABLE lease_exit_final_settlements
  ADD COLUMN IF NOT EXISTS short_notice_charge_due_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_due_amount BIGINT NOT NULL DEFAULT 0;

-- Historical settlements did not persist how much of a short-notice charge
-- remained due. Recover the only possible bounded value before adding guards.
UPDATE lease_exit_final_settlements
SET short_notice_charge_due_amount=LEAST(
      approved_short_notice_charge,
      GREATEST(
        rent_amount_due_before_deposit_offset-earned_rent_amount_due_before_deposit_offset,
        0
      )
    )
WHERE short_notice_charge_due_amount=0
  AND approved_short_notice_charge>0;

ALTER TABLE lease_exit_final_settlements
  DROP CONSTRAINT IF EXISTS lease_exit_final_settlements_checkout_charge_components_check;

ALTER TABLE lease_exit_final_settlements
  ADD CONSTRAINT lease_exit_final_settlements_checkout_charge_components_check CHECK (
    short_notice_charge_due_amount >= 0
    AND short_notice_charge_due_amount <= approved_short_notice_charge
    AND late_checkout_penalty_amount >= 0
    AND late_checkout_penalty_due_amount >= 0
    AND late_checkout_penalty_due_amount <= late_checkout_penalty_amount
  );

ALTER TABLE property_owner_earnings
  DROP CONSTRAINT IF EXISTS property_owner_earnings_source_check;
ALTER TABLE property_owner_earnings
  ADD CONSTRAINT property_owner_earnings_source_check CHECK (
    earning_source IN ('rent_service','checkout_short_notice','checkout_late_penalty')
  );

CREATE INDEX IF NOT EXISTS idx_lease_checkout_late_penalty_open
  ON lease_checkout_commands(property_id,penalty_free_until_date)
  WHERE charge_policy='late_checkout_penalty_v1'
    AND state IN ('notice_received','scheduled');

-- A late-checkout charge is owner revenue only after its final checkout
-- invoice has a verified allocation. It is intentionally separate from the
-- historical short-notice source: a new command can never create both.
CREATE OR REPLACE FUNCTION validate_property_owner_late_penalty_earning_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  authority RECORD;
  assignment_property UUID;
  assignment_owner UUID;
  assignment_room UUID;
BEGIN
  IF NEW.earning_status <> 'recognized' THEN RETURN NEW; END IF;

  SELECT allocations.id AS allocation_id,allocations.payment_id,allocations.lease_id,
         payments.property_id AS payment_property_id,
         invoices.property_id AS invoice_property_id,invoices.room_id AS invoice_room_id,
         invoices.lease_id AS invoice_lease_id,invoices.resident_id AS invoice_resident_id,
         payments.resident_id AS payment_resident_id,payments.payment_purpose,payments.payment_status,
         allocations.target_type,allocations.allocation_purpose,allocations.allocation_status,
         invoices.invoice_purpose,invoices.invoice_status,invoices.other_charge_type,
         settlements.actual_checkout_date,policies.id AS policy_id,
         GREATEST(LEAST(
           COALESCE((line.metadata #>> '{component_breakdown,lateCheckoutPenaltyAmount}')::bigint,0),
           settlements.late_checkout_penalty_due_amount::bigint
         ),0) AS payable_late_penalty,
         GREATEST(
           LEAST(
             GREATEST(LEAST(
               COALESCE((line.metadata #>> '{component_breakdown,lateCheckoutPenaltyAmount}')::bigint,0),
               settlements.late_checkout_penalty_due_amount::bigint
             ),0),
             GREATEST(allocated_totals.allocated_through-precedence.late_penalty_offset,0)
           ) - LEAST(
             GREATEST(LEAST(
               COALESCE((line.metadata #>> '{component_breakdown,lateCheckoutPenaltyAmount}')::bigint,0),
               settlements.late_checkout_penalty_due_amount::bigint
             ),0),
             GREATEST(allocated_totals.allocated_before-precedence.late_penalty_offset,0)
           ),0
         )::bigint AS expected_owner_amount
    INTO authority
  FROM payment_allocations allocations
  JOIN payments ON payments.id=allocations.payment_id
  JOIN invoices ON invoices.id=allocations.invoice_id
  JOIN lease_exit_final_invoice_links links
    ON links.invoice_id=invoices.id AND links.component_type='final_adjustment'
  JOIN lease_exit_final_settlements settlements
    ON settlements.id=links.final_settlement_id AND settlements.checkout_command_id=links.checkout_command_id
       AND settlements.lease_id=links.lease_id
  JOIN LATERAL (
    SELECT items.metadata FROM invoice_line_items items
    WHERE items.invoice_id=invoices.id AND items.line_type='other'
      AND items.metadata->>'category'='checkout_final_adjustment'
    ORDER BY items.sort_order,items.id LIMIT 1
  ) line ON true
  JOIN LATERAL (
    SELECT GREATEST(
      COALESCE((line.metadata #>> '{component_breakdown,rentBalanceAmount}')::bigint,0)
      + COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
      0
    ) AS late_penalty_offset
  ) precedence ON true
  JOIN LATERAL (
    SELECT COALESCE(SUM(candidate.allocated_amount) FILTER (
             WHERE (candidate.allocated_at,candidate.id)<(allocations.allocated_at,allocations.id)
           ),0)::bigint AS allocated_before,
           COALESCE(SUM(candidate.allocated_amount),0)::bigint AS allocated_through
    FROM payment_allocations candidate
    JOIN payments candidate_payment ON candidate_payment.id=candidate.payment_id
    WHERE candidate.invoice_id=invoices.id AND candidate.target_type='invoice'
      AND candidate.allocation_status='active' AND candidate_payment.payment_status='verified'
      AND NOT EXISTS (SELECT 1 FROM payment_reversal_allocations reversal
                      WHERE reversal.original_allocation_id=candidate.id)
      AND (candidate.allocated_at,candidate.id)<=(allocations.allocated_at,allocations.id)
  ) allocated_totals ON true
  JOIN LATERAL (
    SELECT commercial.id FROM property_owner_commercial_policies commercial
    WHERE commercial.property_id=settlements.property_id AND commercial.policy_status='active'
      AND commercial.effective_from<=settlements.actual_checkout_date
      AND (commercial.effective_until IS NULL OR settlements.actual_checkout_date+1<=commercial.effective_until)
    ORDER BY commercial.effective_from DESC,commercial.id LIMIT 1
  ) policies ON true
  WHERE allocations.id=NEW.payment_allocation_id;

  IF authority.allocation_id IS NULL
     OR NEW.service_from IS NULL OR NEW.service_until IS NULL
     OR NEW.service_from<>authority.actual_checkout_date OR NEW.service_until<>authority.actual_checkout_date+1
     OR NEW.earning_month<>date_trunc('month',authority.actual_checkout_date)::date
     OR NEW.payment_id<>authority.payment_id OR NEW.lease_id IS DISTINCT FROM authority.lease_id
     OR NEW.property_id<>authority.payment_property_id OR NEW.property_id<>authority.invoice_property_id
     OR NEW.room_id<>authority.invoice_room_id OR authority.invoice_lease_id IS DISTINCT FROM authority.lease_id
     OR authority.payment_resident_id IS DISTINCT FROM authority.invoice_resident_id
     OR authority.target_type<>'invoice' OR authority.allocation_purpose<>'other_charge'
     OR authority.allocation_status<>'active' OR authority.payment_purpose<>'other_charge'
     OR authority.payment_status<>'verified' OR authority.invoice_purpose<>'other_charge'
     OR authority.other_charge_type<>'checkout_final_adjustment'
     OR authority.invoice_status NOT IN ('issued','unpaid','partially_paid','paid','overdue')
     OR authority.payable_late_penalty<=0 OR authority.expected_owner_amount<=0
     OR NEW.gross_collected_amount<>authority.expected_owner_amount
     OR NEW.owner_earned_amount<>authority.expected_owner_amount OR NEW.operator_fee_amount<>0
     OR NEW.policy_id<>authority.policy_id
     OR EXISTS (SELECT 1 FROM payment_reversal_allocations reversal
                WHERE reversal.original_allocation_id=NEW.payment_allocation_id) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_LATE_CHECKOUT_EARNING_AUTHORITY_MISMATCH' USING ERRCODE='23514';
  END IF;

  IF NEW.ownership_kind='building' THEN
    SELECT assignments.property_id,assignments.owner_profile_id,rooms.id
      INTO assignment_property,assignment_owner,assignment_room
    FROM building_owner_assignments assignments
    JOIN rooms ON rooms.building_id=assignments.building_id AND rooms.property_id=assignments.property_id
    WHERE assignments.id=NEW.ownership_assignment_id AND rooms.id=NEW.room_id
      AND assignments.assignment_status IN ('active','released')
      AND assignments.effective_from<=NEW.service_from
      AND (assignments.effective_until IS NULL OR NEW.service_until<=assignments.effective_until);
  ELSE
    SELECT assignments.property_id,assignments.owner_profile_id,assignments.room_id
      INTO assignment_property,assignment_owner,assignment_room
    FROM room_owner_assignments assignments
    WHERE assignments.id=NEW.ownership_assignment_id
      AND assignments.assignment_status IN ('active','released')
      AND assignments.effective_from<=NEW.service_from
      AND (assignments.effective_until IS NULL OR NEW.service_until<=assignments.effective_until);
  END IF;

  IF assignment_property IS NULL OR assignment_property<>NEW.property_id
     OR assignment_owner<>NEW.owner_profile_id OR assignment_room<>NEW.room_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_LATE_CHECKOUT_EARNING_ASSIGNMENT_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_late_penalty_earning ON property_owner_earnings;
CREATE TRIGGER trg_validate_property_owner_late_penalty_earning
  BEFORE INSERT OR UPDATE ON property_owner_earnings
  FOR EACH ROW WHEN (NEW.earning_source='checkout_late_penalty')
  EXECUTE FUNCTION validate_property_owner_late_penalty_earning_authority();

CREATE OR REPLACE FUNCTION recognize_property_owner_checkout_late_penalties(
  p_property_id UUID,
  p_through_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE inserted_count INTEGER:=0;
BEGIN
  IF p_property_id IS NULL OR p_through_date IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_RECOGNITION_SCOPE_REQUIRED' USING ERRCODE='22004';
  END IF;
  WITH allocated AS (
    SELECT allocations.id AS allocation_id,allocations.payment_id,allocations.lease_id,
           allocations.allocated_amount::bigint,allocations.allocated_at,payments.property_id,
           invoices.id AS invoice_id,invoices.room_id,settlements.actual_checkout_date AS service_day,
           GREATEST(LEAST(
             COALESCE((line.metadata #>> '{component_breakdown,lateCheckoutPenaltyAmount}')::bigint,0),
             settlements.late_checkout_penalty_due_amount::bigint
           ),0) AS late_penalty_cap,
           GREATEST(
             COALESCE((line.metadata #>> '{component_breakdown,rentBalanceAmount}')::bigint,0)
             + COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
             0
           ) AS late_penalty_offset,
           COALESCE(SUM(allocations.allocated_amount) OVER (
             PARTITION BY invoices.id ORDER BY allocations.allocated_at,allocations.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ),0)::bigint AS allocated_before
    FROM payment_allocations allocations
    JOIN payments ON payments.id=allocations.payment_id
    JOIN invoices ON invoices.id=allocations.invoice_id
    JOIN lease_exit_final_invoice_links links ON links.invoice_id=invoices.id AND links.component_type='final_adjustment'
    JOIN lease_exit_final_settlements settlements
      ON settlements.id=links.final_settlement_id AND settlements.checkout_command_id=links.checkout_command_id
         AND settlements.lease_id=links.lease_id
    JOIN leases ON leases.id=settlements.lease_id
    JOIN occupancies ON occupancies.id=leases.occupancy_id
    JOIN LATERAL (
      SELECT items.metadata FROM invoice_line_items items
      WHERE items.invoice_id=invoices.id AND items.line_type='other'
        AND items.metadata->>'category'='checkout_final_adjustment'
      ORDER BY items.sort_order,items.id LIMIT 1
    ) line ON true
    WHERE payments.property_id=p_property_id AND payments.payment_status='verified'
      AND payments.payment_purpose='other_charge' AND allocations.target_type='invoice'
      AND allocations.allocation_status='active' AND allocations.allocation_purpose='other_charge'
      AND invoices.invoice_purpose='other_charge' AND invoices.other_charge_type='checkout_final_adjustment'
      AND invoices.invoice_status IN ('issued','unpaid','partially_paid','paid','overdue')
      AND leases.lease_status IN ('ended','completed') AND occupancies.occupancy_status='ended'
      AND settlements.actual_checkout_date<=p_through_date
      AND NOT EXISTS (SELECT 1 FROM payment_reversal_allocations reversal
                      WHERE reversal.original_allocation_id=allocations.id)
  ), eligible AS (
    SELECT allocated.*,GREATEST(
      LEAST(late_penalty_cap,GREATEST(allocated_before+allocated_amount-late_penalty_offset,0))
      - LEAST(late_penalty_cap,GREATEST(allocated_before-late_penalty_offset,0)),0
    )::bigint AS owner_amount
    FROM allocated WHERE late_penalty_cap>0
  ), owned AS (
    SELECT eligible.*,'building'::text AS ownership_kind,assignments.id AS assignment_id,assignments.owner_profile_id
    FROM eligible JOIN rooms ON rooms.id=eligible.room_id
    JOIN building_owner_assignments assignments
      ON assignments.property_id=eligible.property_id AND assignments.building_id=rooms.building_id
     AND assignments.assignment_status IN ('active','released') AND assignments.effective_from<=eligible.service_day
     AND (assignments.effective_until IS NULL OR eligible.service_day+1<=assignments.effective_until)
    WHERE eligible.owner_amount>0
    UNION ALL
    SELECT eligible.*,'room'::text,assignments.id,assignments.owner_profile_id
    FROM eligible JOIN room_owner_assignments assignments
      ON assignments.property_id=eligible.property_id AND assignments.room_id=eligible.room_id
     AND assignments.assignment_status IN ('active','released') AND assignments.effective_from<=eligible.service_day
     AND (assignments.effective_until IS NULL OR eligible.service_day+1<=assignments.effective_until)
    WHERE eligible.owner_amount>0
  ), authorized AS (
    SELECT owned.*,policy.id AS policy_id FROM owned JOIN LATERAL (
      SELECT policies.id FROM property_owner_commercial_policies policies
      WHERE policies.property_id=owned.property_id AND policies.policy_status='active'
        AND policies.effective_from<=owned.service_day
        AND (policies.effective_until IS NULL OR owned.service_day+1<=policies.effective_until)
      ORDER BY policies.effective_from DESC,policies.id LIMIT 1
    ) policy ON true
  ), inserted AS (
    INSERT INTO property_owner_earnings(
      property_id,owner_profile_id,ownership_kind,ownership_assignment_id,room_id,lease_id,payment_id,
      payment_allocation_id,earning_month,service_from,service_until,gross_collected_amount,
      owner_earned_amount,operator_fee_amount,earning_status,policy_id,recognized_at,earning_source
    )
    SELECT property_id,owner_profile_id,ownership_kind,assignment_id,room_id,lease_id,payment_id,
           allocation_id,date_trunc('month',service_day)::date,service_day,service_day+1,owner_amount,
           owner_amount,0,'recognized',policy_id,service_day::timestamp AT TIME ZONE 'Asia/Jakarta',
           'checkout_late_penalty'
    FROM authorized ON CONFLICT DO NOTHING RETURNING 1
  ) SELECT COUNT(*)::integer INTO inserted_count FROM inserted;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION recognize_property_owner_earnings(
  p_property_id UUID,
  p_through_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE rent_count INTEGER; short_notice_count INTEGER; late_penalty_count INTEGER;
BEGIN
  rent_count:=recognize_property_owner_rent_earnings(p_property_id,p_through_date);
  short_notice_count:=recognize_property_owner_checkout_compensations(p_property_id,p_through_date);
  late_penalty_count:=recognize_property_owner_checkout_late_penalties(p_property_id,p_through_date);
  RETURN rent_count+short_notice_count+late_penalty_count;
END;
$$;

COMMIT;
