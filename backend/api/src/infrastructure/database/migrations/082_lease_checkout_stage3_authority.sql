-- Stage 3 hardens the existing W07D/M5 checkout authority. It preserves gross
-- settlement components, represents damage above deposit, records the request
-- source/note, and links every remaining balance to authoritative invoices.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_exit_final_settlements') IS NULL
     OR to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'LEASE_CHECKOUT_STAGE3_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE lease_checkout_commands
  ADD COLUMN IF NOT EXISTS internal_note TEXT;

ALTER TABLE lease_checkout_commands
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_m5_exit_quote_check;

ALTER TABLE lease_checkout_commands
  ADD CONSTRAINT lease_checkout_commands_m5_exit_quote_check CHECK (
    exit_type IS NULL OR (
      request_source IN (
        'admin_recorded_resident_request','admin_recorded_normal_expiry',
        'resident','parent','admin','other'
      )
      AND requested_by_user_id IS NOT NULL
      AND planned_lease_end_date IS NOT NULL
      AND notice_days IS NOT NULL AND notice_days >= 0
      AND missing_notice_days IS NOT NULL AND missing_notice_days BETWEEN 0 AND 14
      AND payment_period_days IS NOT NULL AND payment_period_days > 0
      AND daily_rate_amount IS NOT NULL AND daily_rate_amount > 0
      AND recommended_short_notice_charge IS NOT NULL
      AND recommended_short_notice_charge >= 0
    )
  );

ALTER TABLE lease_checkout_commands
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_internal_note_check;

ALTER TABLE lease_checkout_commands
  ADD CONSTRAINT lease_checkout_commands_internal_note_check CHECK (
    internal_note IS NULL OR char_length(trim(internal_note)) BETWEEN 1 AND 2000
  );

ALTER TABLE lease_exit_final_settlements
  ADD COLUMN IF NOT EXISTS documented_damage_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damage_amount_due BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_refund_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount_due BIGINT NOT NULL DEFAULT 0;

UPDATE lease_exit_final_settlements
SET documented_damage_amount=deposit_deduction_amount,
    damage_amount_due=0,
    gross_refund_amount=recommended_refund_amount,
    gross_amount_due=amount_due
WHERE documented_damage_amount=0
  AND damage_amount_due=0
  AND gross_refund_amount=0
  AND gross_amount_due=0;

ALTER TABLE lease_exit_final_settlements
  DROP CONSTRAINT IF EXISTS lease_exit_final_settlements_damage_components_check,
  DROP CONSTRAINT IF EXISTS lease_exit_final_settlements_net_direction_check;

ALTER TABLE lease_exit_final_settlements
  ADD CONSTRAINT lease_exit_final_settlements_damage_components_check CHECK (
    documented_damage_amount >= 0
    AND damage_amount_due >= 0
    AND documented_damage_amount = deposit_deduction_amount + damage_amount_due
  ),
  ADD CONSTRAINT lease_exit_final_settlements_net_direction_check CHECK (
    gross_refund_amount = rent_refundable_amount + refundable_deposit_amount
    AND gross_amount_due = rent_amount_due_before_deposit_offset
      - deposit_rent_offset_amount + damage_amount_due
    AND recommended_refund_amount = GREATEST(gross_refund_amount-gross_amount_due,0)
    AND amount_due = GREATEST(gross_amount_due-gross_refund_amount,0)
  );

CREATE TABLE IF NOT EXISTS lease_exit_final_invoice_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  final_settlement_id UUID NOT NULL REFERENCES lease_exit_final_settlements(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  component_type TEXT NOT NULL CHECK (component_type IN ('rent_balance','final_adjustment')),
  linked_amount BIGINT NOT NULL CHECK (linked_amount > 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_exit_final_invoice_links_component_unique
    UNIQUE(final_settlement_id,invoice_id,component_type)
);

CREATE INDEX IF NOT EXISTS idx_lease_exit_final_invoice_links_invoice
  ON lease_exit_final_invoice_links(property_id,invoice_id);
CREATE INDEX IF NOT EXISTS idx_lease_exit_final_invoice_links_settlement
  ON lease_exit_final_invoice_links(final_settlement_id,component_type);

ALTER TABLE lease_exit_invoice_adjustments
  DROP CONSTRAINT IF EXISTS lease_exit_invoice_adjustments_adjustment_type_check;
ALTER TABLE lease_exit_invoice_adjustments
  ADD CONSTRAINT lease_exit_invoice_adjustments_adjustment_type_check CHECK (
    adjustment_type IN ('unearned_rent_termination','final_settlement_netting')
  );

ALTER TABLE lease_exit_invoice_adjustments
  DROP CONSTRAINT IF EXISTS lease_exit_invoice_adjustments_checkout_invoice_unique;
ALTER TABLE lease_exit_invoice_adjustments
  ADD CONSTRAINT lease_exit_invoice_adjustments_checkout_invoice_unique
    UNIQUE(checkout_command_id,invoice_id,adjustment_type);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_w06_other_charge_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_w06_other_charge_check CHECK (
  (invoice_purpose <> 'other_charge')
  OR (
    other_charge_type IN (
      'documented_damage','utilities','parking','lost_key_or_access_card',
      'approved_administration','other','checkout_final_adjustment'
    )
    AND char_length(trim(COALESCE(other_charge_description,''))) BETWEEN 3 AND 500
  )
);

ALTER TABLE lease_checkout_evidence
  DROP CONSTRAINT IF EXISTS lease_checkout_evidence_category_check;
ALTER TABLE lease_checkout_evidence
  ADD CONSTRAINT lease_checkout_evidence_category_check CHECK (
    evidence_category IN (
      'keys_access','inventory','parking','inspection','damage','refund','utilities',
      'deposit_offset','settlement','notice_exception','short_notice_waiver'
    )
  );

-- Short-notice compensation is collected cash that belongs entirely to the
-- Property Owner. It is deliberately a different earning source from daily
-- rent service so damage recovery can never leak into Owner revenue and no
-- additional monthly management fee is created.
ALTER TABLE property_owner_earnings
  ADD COLUMN IF NOT EXISTS earning_source TEXT NOT NULL DEFAULT 'rent_service';

ALTER TABLE property_owner_earnings
  DROP CONSTRAINT IF EXISTS property_owner_earnings_source_check;
ALTER TABLE property_owner_earnings
  ADD CONSTRAINT property_owner_earnings_source_check CHECK (
    earning_source IN ('rent_service','checkout_short_notice')
  );

CREATE INDEX IF NOT EXISTS idx_property_owner_earnings_source_month
  ON property_owner_earnings(property_id,owner_profile_id,earning_source,earning_month)
  WHERE earning_status='recognized';

DROP TRIGGER IF EXISTS trg_validate_property_owner_earning_authority
  ON property_owner_earnings;
CREATE TRIGGER trg_validate_property_owner_earning_authority
  BEFORE INSERT OR UPDATE ON property_owner_earnings
  FOR EACH ROW
  WHEN (NEW.earning_source='rent_service')
  EXECUTE FUNCTION validate_property_owner_earning_authority();

CREATE OR REPLACE FUNCTION validate_property_owner_short_notice_earning_authority()
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

  SELECT allocations.id AS allocation_id,
         allocations.payment_id,
         allocations.lease_id,
         allocations.allocated_amount::bigint,
         allocations.target_type,
         allocations.allocation_purpose,
         allocations.allocation_status,
         payments.property_id AS payment_property_id,
         payments.resident_id AS payment_resident_id,
         payments.payment_purpose,
         payments.payment_status,
         invoices.property_id AS invoice_property_id,
         invoices.room_id AS invoice_room_id,
         invoices.lease_id AS invoice_lease_id,
         invoices.resident_id AS invoice_resident_id,
         invoices.invoice_purpose,
         invoices.invoice_status,
         invoices.other_charge_type,
         settlements.actual_checkout_date,
         settlements.approved_short_notice_charge::bigint,
         policies.id AS policy_id,
         GREATEST(
           LEAST(
             COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
             settlements.approved_short_notice_charge::bigint
           ),
           0
         ) AS payable_short_notice,
         GREATEST(
           LEAST(
             COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
             COALESCE((
               SELECT SUM(candidate.allocated_amount)::bigint
               FROM payment_allocations candidate
               JOIN payments candidate_payment ON candidate_payment.id=candidate.payment_id
               WHERE candidate.invoice_id=invoices.id
                 AND candidate.target_type='invoice'
                 AND candidate.allocation_status='active'
                 AND candidate_payment.payment_status='verified'
                 AND NOT EXISTS (
                   SELECT 1 FROM payment_reversal_allocations reversal
                   WHERE reversal.original_allocation_id=candidate.id
                 )
                 AND (candidate.allocated_at,candidate.id)
                     <= (allocations.allocated_at,allocations.id)
             ),0)
           ) - LEAST(
             COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
             COALESCE((
               SELECT SUM(candidate.allocated_amount)::bigint
               FROM payment_allocations candidate
               JOIN payments candidate_payment ON candidate_payment.id=candidate.payment_id
               WHERE candidate.invoice_id=invoices.id
                 AND candidate.target_type='invoice'
                 AND candidate.allocation_status='active'
                 AND candidate_payment.payment_status='verified'
                 AND NOT EXISTS (
                   SELECT 1 FROM payment_reversal_allocations reversal
                   WHERE reversal.original_allocation_id=candidate.id
                 )
                 AND (candidate.allocated_at,candidate.id)
                     < (allocations.allocated_at,allocations.id)
             ),0)
           ),
           0
         )::bigint AS expected_owner_amount
    INTO authority
  FROM payment_allocations allocations
  JOIN payments ON payments.id=allocations.payment_id
  JOIN invoices ON invoices.id=allocations.invoice_id
  JOIN lease_exit_final_invoice_links links
    ON links.invoice_id=invoices.id AND links.component_type='final_adjustment'
  JOIN lease_exit_final_settlements settlements
    ON settlements.id=links.final_settlement_id
   AND settlements.checkout_command_id=links.checkout_command_id
   AND settlements.lease_id=links.lease_id
  JOIN leases ON leases.id=settlements.lease_id
  JOIN LATERAL (
    SELECT items.metadata
    FROM invoice_line_items items
    WHERE items.invoice_id=invoices.id
      AND items.line_type='other'
      AND items.metadata->>'category'='checkout_final_adjustment'
    ORDER BY items.sort_order,items.id
    LIMIT 1
  ) line ON true
  JOIN LATERAL (
    SELECT commercial.id
    FROM property_owner_commercial_policies commercial
    WHERE commercial.property_id=settlements.property_id
      AND commercial.policy_status='active'
      AND commercial.effective_from<=settlements.actual_checkout_date
      AND (commercial.effective_until IS NULL
           OR settlements.actual_checkout_date+1<=commercial.effective_until)
    ORDER BY commercial.effective_from DESC,commercial.id
    LIMIT 1
  ) policies ON true
  WHERE allocations.id=NEW.payment_allocation_id;

  IF authority.allocation_id IS NULL
     OR NEW.service_from IS NULL OR NEW.service_until IS NULL
     OR NEW.service_from<>authority.actual_checkout_date
     OR NEW.service_until<>authority.actual_checkout_date+1
     OR NEW.earning_month<>date_trunc('month',authority.actual_checkout_date)::date
     OR NEW.payment_id<>authority.payment_id
     OR NEW.lease_id IS DISTINCT FROM authority.lease_id
     OR NEW.property_id<>authority.payment_property_id
     OR NEW.property_id<>authority.invoice_property_id
     OR NEW.room_id<>authority.invoice_room_id
     OR authority.invoice_lease_id IS DISTINCT FROM authority.lease_id
     OR authority.payment_resident_id IS DISTINCT FROM authority.invoice_resident_id
     OR authority.target_type<>'invoice'
     OR authority.allocation_purpose<>'other_charge'
     OR authority.allocation_status<>'active'
     OR authority.payment_purpose<>'other_charge'
     OR authority.payment_status<>'verified'
     OR authority.invoice_purpose<>'other_charge'
     OR authority.other_charge_type<>'checkout_final_adjustment'
     OR authority.invoice_status NOT IN ('issued','unpaid','partially_paid','paid','overdue')
     OR authority.payable_short_notice<=0
     OR authority.expected_owner_amount<=0
     OR NEW.gross_collected_amount<>authority.expected_owner_amount
     OR NEW.owner_earned_amount<>authority.expected_owner_amount
     OR NEW.operator_fee_amount<>0
     OR NEW.policy_id<>authority.policy_id
     OR EXISTS (
       SELECT 1 FROM payment_reversal_allocations reversal
       WHERE reversal.original_allocation_id=NEW.payment_allocation_id
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_SHORT_NOTICE_EARNING_AUTHORITY_MISMATCH'
      USING ERRCODE='23514';
  END IF;

  IF NEW.ownership_kind='building' THEN
    SELECT assignments.property_id,assignments.owner_profile_id,rooms.id
      INTO assignment_property,assignment_owner,assignment_room
    FROM building_owner_assignments assignments
    JOIN rooms ON rooms.building_id=assignments.building_id
              AND rooms.property_id=assignments.property_id
    WHERE assignments.id=NEW.ownership_assignment_id
      AND rooms.id=NEW.room_id
      AND assignments.assignment_status IN ('active','released')
      AND assignments.effective_from<=NEW.service_from
      AND (assignments.effective_until IS NULL
           OR NEW.service_until<=assignments.effective_until);
  ELSE
    SELECT assignments.property_id,assignments.owner_profile_id,assignments.room_id
      INTO assignment_property,assignment_owner,assignment_room
    FROM room_owner_assignments assignments
    WHERE assignments.id=NEW.ownership_assignment_id
      AND assignments.assignment_status IN ('active','released')
      AND assignments.effective_from<=NEW.service_from
      AND (assignments.effective_until IS NULL
           OR NEW.service_until<=assignments.effective_until);
  END IF;

  IF assignment_property IS NULL OR assignment_property<>NEW.property_id
     OR assignment_owner<>NEW.owner_profile_id OR assignment_room<>NEW.room_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_SHORT_NOTICE_EARNING_ASSIGNMENT_MISMATCH'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_short_notice_earning
  ON property_owner_earnings;
CREATE TRIGGER trg_validate_property_owner_short_notice_earning
  BEFORE INSERT OR UPDATE ON property_owner_earnings
  FOR EACH ROW
  WHEN (NEW.earning_source='checkout_short_notice')
  EXECUTE FUNCTION validate_property_owner_short_notice_earning_authority();

DO $$
BEGIN
  IF to_regprocedure('recognize_property_owner_rent_earnings(uuid,date)') IS NULL THEN
    ALTER FUNCTION recognize_property_owner_earnings(UUID,DATE)
      RENAME TO recognize_property_owner_rent_earnings;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION recognize_property_owner_checkout_compensations(
  p_property_id UUID,
  p_through_date DATE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count INTEGER:=0;
BEGIN
  IF p_property_id IS NULL OR p_through_date IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_RECOGNITION_SCOPE_REQUIRED'
      USING ERRCODE='22004';
  END IF;

  WITH allocated AS (
    SELECT allocations.id AS allocation_id,allocations.payment_id,
           allocations.lease_id,allocations.allocated_amount::bigint,
           allocations.allocated_at,payments.property_id,
           invoices.id AS invoice_id,invoices.room_id,
           settlements.actual_checkout_date AS service_day,
           LEAST(
             COALESCE((line.metadata #>> '{component_breakdown,shortNoticeAmount}')::bigint,0),
             settlements.approved_short_notice_charge::bigint
           ) AS short_notice_cap,
           COALESCE(SUM(allocations.allocated_amount) OVER (
             PARTITION BY invoices.id
             ORDER BY allocations.allocated_at,allocations.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ),0)::bigint AS allocated_before
    FROM payment_allocations allocations
    JOIN payments ON payments.id=allocations.payment_id
    JOIN invoices ON invoices.id=allocations.invoice_id
    JOIN lease_exit_final_invoice_links links
      ON links.invoice_id=invoices.id AND links.component_type='final_adjustment'
    JOIN lease_exit_final_settlements settlements
      ON settlements.id=links.final_settlement_id
     AND settlements.checkout_command_id=links.checkout_command_id
     AND settlements.lease_id=links.lease_id
    JOIN leases ON leases.id=settlements.lease_id
    JOIN occupancies ON occupancies.id=leases.occupancy_id
    JOIN LATERAL (
      SELECT items.metadata
      FROM invoice_line_items items
      WHERE items.invoice_id=invoices.id
        AND items.line_type='other'
        AND items.metadata->>'category'='checkout_final_adjustment'
      ORDER BY items.sort_order,items.id
      LIMIT 1
    ) line ON true
    WHERE payments.property_id=p_property_id
      AND payments.payment_status='verified'
      AND payments.payment_purpose='other_charge'
      AND allocations.target_type='invoice'
      AND allocations.allocation_status='active'
      AND allocations.allocation_purpose='other_charge'
      AND invoices.invoice_purpose='other_charge'
      AND invoices.other_charge_type='checkout_final_adjustment'
      AND invoices.invoice_status IN ('issued','unpaid','partially_paid','paid','overdue')
      AND leases.lease_status IN ('ended','completed')
      AND occupancies.occupancy_status='ended'
      AND settlements.actual_checkout_date<=p_through_date
      AND NOT EXISTS (
        SELECT 1 FROM payment_reversal_allocations reversal
        WHERE reversal.original_allocation_id=allocations.id
      )
  ), eligible AS (
    SELECT allocated.*,
           GREATEST(
             LEAST(short_notice_cap,allocated_before+allocated_amount)
             - LEAST(short_notice_cap,allocated_before),0
           )::bigint AS owner_amount
    FROM allocated
    WHERE short_notice_cap>0
  ), owned AS (
    SELECT eligible.*,'building'::text AS ownership_kind,
           assignments.id AS assignment_id,assignments.owner_profile_id
    FROM eligible
    JOIN rooms ON rooms.id=eligible.room_id
    JOIN building_owner_assignments assignments
      ON assignments.property_id=eligible.property_id
     AND assignments.building_id=rooms.building_id
     AND assignments.assignment_status IN ('active','released')
     AND assignments.effective_from<=eligible.service_day
     AND (assignments.effective_until IS NULL
          OR eligible.service_day+1<=assignments.effective_until)
    WHERE eligible.owner_amount>0
    UNION ALL
    SELECT eligible.*,'room'::text,assignments.id,assignments.owner_profile_id
    FROM eligible
    JOIN room_owner_assignments assignments
      ON assignments.property_id=eligible.property_id
     AND assignments.room_id=eligible.room_id
     AND assignments.assignment_status IN ('active','released')
     AND assignments.effective_from<=eligible.service_day
     AND (assignments.effective_until IS NULL
          OR eligible.service_day+1<=assignments.effective_until)
    WHERE eligible.owner_amount>0
  ), authorized AS (
    SELECT owned.*,policy.id AS policy_id
    FROM owned
    JOIN LATERAL (
      SELECT policies.id
      FROM property_owner_commercial_policies policies
      WHERE policies.property_id=owned.property_id
        AND policies.policy_status='active'
        AND policies.effective_from<=owned.service_day
        AND (policies.effective_until IS NULL
             OR owned.service_day+1<=policies.effective_until)
      ORDER BY policies.effective_from DESC,policies.id
      LIMIT 1
    ) policy ON true
  ), inserted AS (
    INSERT INTO property_owner_earnings(
      property_id,owner_profile_id,ownership_kind,ownership_assignment_id,
      room_id,lease_id,payment_id,payment_allocation_id,earning_month,
      service_from,service_until,gross_collected_amount,owner_earned_amount,
      operator_fee_amount,earning_status,policy_id,recognized_at,earning_source
    )
    SELECT property_id,owner_profile_id,ownership_kind,assignment_id,
           room_id,lease_id,payment_id,allocation_id,date_trunc('month',service_day)::date,
           service_day,service_day+1,owner_amount,owner_amount,0,
           'recognized',policy_id,service_day::timestamp AT TIME ZONE 'Asia/Jakarta',
           'checkout_short_notice'
    FROM authorized
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO inserted_count FROM inserted;

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
DECLARE
  rent_count INTEGER;
  compensation_count INTEGER;
BEGIN
  rent_count:=recognize_property_owner_rent_earnings(p_property_id,p_through_date);
  compensation_count:=recognize_property_owner_checkout_compensations(
    p_property_id,p_through_date
  );
  RETURN rent_count+compensation_count;
END;
$$;

COMMIT;
