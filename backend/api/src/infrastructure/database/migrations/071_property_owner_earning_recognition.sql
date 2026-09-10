BEGIN;

-- Advance rent and DP allocations are both rent credits. Security deposits are
-- deliberately excluded because they never target a rent invoice.
CREATE OR REPLACE FUNCTION validate_property_owner_earning_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_property UUID;
  assignment_owner UUID;
  assignment_room UUID;
  allocation_scope RECORD;
  lease_scope RECORD;
  policy_property UUID;
BEGIN
  IF NEW.earning_status <> 'recognized' THEN
    RETURN NEW;
  END IF;

  IF NEW.service_from IS NULL OR NEW.service_until IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.payment_allocation_id IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.service_from < NEW.earning_month
     OR NEW.service_until > (NEW.earning_month + INTERVAL '1 month')::date THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_MONTH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT allocations.id AS allocation_id,
         allocations.payment_id AS allocation_payment_id,
         allocations.lease_id AS allocation_lease_id,
         allocations.target_type AS allocation_target_type,
         allocations.allocation_purpose,
         allocations.allocation_status,
         allocations.allocated_amount,
         payments.property_id AS payment_property_id,
         payments.lease_id AS payment_lease_id,
         payments.resident_id AS payment_resident_id,
         payments.payment_purpose,
         payments.payment_status,
         invoices.property_id AS invoice_property_id,
         invoices.room_id AS invoice_room_id,
         invoices.lease_id AS invoice_lease_id,
         invoices.occupancy_id AS invoice_occupancy_id,
         invoices.invoice_purpose,
         invoices.invoice_status,
         invoices.cycle_start_date,
         invoices.cycle_end_date,
         leases.property_id AS lease_property_id,
         leases.room_id AS lease_room_id,
         leases.resident_id AS lease_resident_id,
         leases.occupancy_id AS lease_occupancy_id,
         leases.lease_status,
         leases.start_date AS lease_start_date,
         leases.end_date AS lease_end_date,
         leases.activated_at,
         occupancies.property_id AS occupancy_property_id,
         occupancies.room_id AS occupancy_room_id,
         occupancies.resident_id AS occupancy_resident_id,
         occupancies.occupancy_status,
         occupancies.start_date AS occupancy_start_date,
         occupancies.end_date AS occupancy_end_date
    INTO allocation_scope
  FROM payment_allocations allocations
  JOIN payments ON payments.id = allocations.payment_id
  JOIN invoices ON invoices.id = allocations.invoice_id
  JOIN leases ON leases.id = NEW.lease_id
  LEFT JOIN occupancies ON occupancies.id = leases.occupancy_id
  WHERE allocations.id = NEW.payment_allocation_id;

  SELECT property_id INTO policy_property
  FROM property_owner_commercial_policies
  WHERE id = NEW.policy_id;
  SELECT property_id, room_id INTO lease_scope FROM leases WHERE id = NEW.lease_id;

  IF allocation_scope.allocation_id IS NULL
     OR allocation_scope.allocation_payment_id <> NEW.payment_id
     OR allocation_scope.allocation_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.payment_property_id <> NEW.property_id
     OR allocation_scope.payment_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.payment_resident_id IS DISTINCT FROM allocation_scope.lease_resident_id
     OR allocation_scope.payment_purpose NOT IN ('rent', 'dp')
     OR allocation_scope.payment_status IS DISTINCT FROM 'verified'
     OR allocation_scope.allocation_target_type IS DISTINCT FROM 'invoice'
     OR allocation_scope.allocation_purpose NOT IN ('rent', 'dp')
     OR allocation_scope.allocation_status IS DISTINCT FROM 'active'
     OR allocation_scope.allocated_amount IS NULL
     OR allocation_scope.allocated_amount <= 0
     OR allocation_scope.invoice_property_id <> NEW.property_id
     OR allocation_scope.invoice_room_id <> NEW.room_id
     OR allocation_scope.invoice_lease_id IS DISTINCT FROM NEW.lease_id
     OR (allocation_scope.invoice_occupancy_id IS NOT NULL
         AND allocation_scope.invoice_occupancy_id IS DISTINCT FROM allocation_scope.lease_occupancy_id)
     OR allocation_scope.invoice_purpose IS DISTINCT FROM 'rent'
     OR allocation_scope.invoice_status NOT IN ('issued', 'unpaid', 'partially_paid', 'paid', 'overdue')
     OR allocation_scope.cycle_start_date IS NULL
     OR allocation_scope.cycle_end_date IS NULL
     OR allocation_scope.lease_property_id <> NEW.property_id
     OR allocation_scope.lease_room_id <> NEW.room_id
     OR allocation_scope.lease_status NOT IN ('active', 'ended', 'completed')
     OR allocation_scope.activated_at IS NULL
     OR allocation_scope.lease_occupancy_id IS NULL
     OR allocation_scope.occupancy_property_id <> NEW.property_id
     OR allocation_scope.occupancy_room_id <> NEW.room_id
     OR allocation_scope.occupancy_resident_id IS DISTINCT FROM allocation_scope.lease_resident_id
     OR allocation_scope.occupancy_status NOT IN ('active', 'ended')
     OR policy_property IS NULL
     OR policy_property <> NEW.property_id
     OR lease_scope.property_id IS NULL
     OR lease_scope.property_id <> NEW.property_id
     OR lease_scope.room_id IS DISTINCT FROM NEW.room_id
     OR EXISTS (
       SELECT 1 FROM payment_reversal_allocations reversals
       WHERE reversals.original_allocation_id = NEW.payment_allocation_id
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW.service_from < GREATEST(
       allocation_scope.cycle_start_date,
       allocation_scope.lease_start_date,
       COALESCE(allocation_scope.activated_at::date, allocation_scope.lease_start_date),
       allocation_scope.occupancy_start_date
     )
     OR NEW.service_until > LEAST(
       allocation_scope.cycle_end_date + 1,
       COALESCE(allocation_scope.lease_end_date + 1, 'infinity'::date),
       COALESCE(allocation_scope.occupancy_end_date + 1, 'infinity'::date)
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM property_owner_commercial_policies policies
    WHERE policies.id = NEW.policy_id
      AND policies.policy_status = 'active'
      AND policies.effective_from <= NEW.service_from
      AND (policies.effective_until IS NULL OR NEW.service_until <= policies.effective_until)
  ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_POLICY_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  IF NEW.ownership_kind = 'building' THEN
    SELECT assignments.property_id, assignments.owner_profile_id, rooms.id
      INTO assignment_property, assignment_owner, assignment_room
    FROM building_owner_assignments assignments
    JOIN rooms ON rooms.building_id = assignments.building_id
              AND rooms.property_id = assignments.property_id
    WHERE assignments.id = NEW.ownership_assignment_id
      AND rooms.id = NEW.room_id
      AND assignments.effective_from <= NEW.service_from
      AND (assignments.effective_until IS NULL OR NEW.service_until <= assignments.effective_until);
  ELSE
    SELECT assignments.property_id, assignments.owner_profile_id, assignments.room_id
      INTO assignment_property, assignment_owner, assignment_room
    FROM room_owner_assignments assignments
    WHERE assignments.id = NEW.ownership_assignment_id
      AND assignments.effective_from <= NEW.service_from
      AND (assignments.effective_until IS NULL OR NEW.service_until <= assignments.effective_until);
  END IF;

  IF assignment_property IS NULL OR assignment_property <> NEW.property_id
     OR assignment_owner <> NEW.owner_profile_id OR assignment_room <> NEW.room_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_ASSIGNMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Recognition is incremental: verified cash may be ahead of delivered service,
-- or part of a service interval may not yet have an Owner assignment. The
-- authoritative guards remain row scope, non-overlap, append-only, and the
-- allocation ceiling below.
CREATE OR REPLACE FUNCTION reconcile_property_owner_service_coverage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allocated BIGINT;
  attributed RECORD;
BEGIN
  IF NEW.earning_status <> 'recognized' THEN RETURN NULL; END IF;

  SELECT allocations.allocated_amount INTO allocated
  FROM payment_allocations allocations
  JOIN payments ON payments.id = allocations.payment_id
  WHERE allocations.id = NEW.payment_allocation_id
    AND allocations.allocation_status = 'active'
    AND payments.payment_status = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM payment_reversal_allocations reversals
      WHERE reversals.original_allocation_id = allocations.id
    );

  SELECT COALESCE(SUM(gross_collected_amount), 0)::bigint AS gross_amount,
         COALESCE(SUM(owner_earned_amount), 0)::bigint AS owner_amount,
         COALESCE(SUM(operator_fee_amount), 0)::bigint AS operator_amount
    INTO attributed
  FROM property_owner_earnings
  WHERE payment_allocation_id = NEW.payment_allocation_id
    AND earning_status = 'recognized';

  IF allocated IS NULL OR attributed.gross_amount > allocated
     OR attributed.owner_amount + attributed.operator_amount <> attributed.gross_amount THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_RECONCILIATION_MISMATCH'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
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
  inserted_count INTEGER := 0;
BEGIN
  IF p_property_id IS NULL OR p_through_date IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_RECOGNITION_SCOPE_REQUIRED' USING ERRCODE = '22004';
  END IF;

  WITH allocation_scope AS (
    SELECT allocations.id AS allocation_id,
           allocations.payment_id,
           allocations.allocated_amount::bigint,
           allocations.lease_id,
           payments.property_id,
           invoices.id AS invoice_id,
           invoices.room_id,
           invoices.snapshot_monthly_price::bigint AS monthly_rate,
           GREATEST(invoices.cycle_start_date, leases.start_date,
                    leases.activated_at::date, occupancies.start_date) AS service_from,
           LEAST(invoices.cycle_end_date + 1,
                 COALESCE(leases.end_date + 1, 'infinity'::date),
                 COALESCE(occupancies.end_date + 1, 'infinity'::date)) AS service_until
    FROM payment_allocations allocations
    JOIN payments ON payments.id = allocations.payment_id
    JOIN invoices ON invoices.id = allocations.invoice_id
    JOIN leases ON leases.id = allocations.lease_id
    JOIN occupancies ON occupancies.id = leases.occupancy_id
    WHERE payments.property_id = p_property_id
      AND payments.payment_status = 'verified'
      AND payments.payment_purpose IN ('rent', 'dp')
      AND allocations.target_type = 'invoice'
      AND allocations.allocation_status = 'active'
      AND allocations.allocation_purpose IN ('rent', 'dp')
      AND invoices.invoice_purpose = 'rent'
      AND invoices.invoice_status IN ('issued', 'unpaid', 'partially_paid', 'paid', 'overdue')
      AND invoices.total_amount > 0
      AND invoices.snapshot_monthly_price > 0
      AND leases.lease_status IN ('active', 'ended', 'completed')
      AND leases.activated_at IS NOT NULL
      AND occupancies.occupancy_status IN ('active', 'ended')
      AND NOT EXISTS (
        SELECT 1 FROM payment_reversal_allocations reversals
        WHERE reversals.original_allocation_id = allocations.id
      )
  ), service_days AS (
    SELECT scope.*,
           day.day::date AS service_day,
           (scope.service_until - scope.service_from)::bigint AS service_days,
           (day.day::date - scope.service_from)::bigint AS service_day_index
    FROM allocation_scope scope
    CROSS JOIN LATERAL generate_series(
      scope.service_from,
      LEAST(scope.service_until - 1, p_through_date),
      INTERVAL '1 day'
    ) day(day)
    WHERE scope.service_from < scope.service_until
      AND scope.service_from <= p_through_date
  ), distributed_days AS (
    SELECT days.*,
           (FLOOR(days.allocated_amount * (days.service_day_index + 1) / days.service_days)
            - FLOOR(days.allocated_amount * days.service_day_index / days.service_days))::bigint
             AS gross_amount
    FROM service_days days
  ), allocated_days AS (
    SELECT days.*
    FROM distributed_days days
    WHERE days.gross_amount > 0
  ), owned_days AS (
    SELECT allocated.*, 'building'::text AS ownership_kind,
           assignments.id AS assignment_id, assignments.owner_profile_id
    FROM allocated_days allocated
    JOIN rooms ON rooms.id = allocated.room_id
    JOIN building_owner_assignments assignments
      ON assignments.property_id = allocated.property_id
     AND assignments.building_id = rooms.building_id
     AND assignments.assignment_status IN ('active', 'released')
     AND assignments.effective_from <= allocated.service_day
     AND (assignments.effective_until IS NULL OR allocated.service_day + 1 <= assignments.effective_until)
    UNION ALL
    SELECT allocated.*, 'room'::text, assignments.id, assignments.owner_profile_id
    FROM allocated_days allocated
    JOIN room_owner_assignments assignments
      ON assignments.property_id = allocated.property_id
     AND assignments.room_id = allocated.room_id
     AND assignments.assignment_status IN ('active', 'released')
     AND assignments.effective_from <= allocated.service_day
     AND (assignments.effective_until IS NULL OR allocated.service_day + 1 <= assignments.effective_until)
  ), authorized_days AS (
    SELECT owned.*,
           policy.id AS policy_id,
           COALESCE(fee.monthly_fee_amount, policy.operator_room_month_fee)::bigint AS monthly_fee
    FROM owned_days owned
    JOIN LATERAL (
      SELECT policies.id, policies.operator_room_month_fee
      FROM property_owner_commercial_policies policies
      WHERE policies.property_id = owned.property_id
        AND policies.policy_status = 'active'
        AND policies.effective_from <= owned.service_day
        AND (policies.effective_until IS NULL OR owned.service_day + 1 <= policies.effective_until)
      ORDER BY policies.effective_from DESC, policies.id
      LIMIT 1
    ) policy ON true
    LEFT JOIN LATERAL (
      SELECT versions.monthly_fee_amount
      FROM property_management_fee_versions versions
      WHERE versions.property_id = owned.property_id
        AND versions.effective_date <= owned.service_day
      ORDER BY versions.effective_date DESC, versions.id
      LIMIT 1
    ) fee ON true
  ), earning_amounts AS (
    SELECT authorized.*,
           GREATEST(0, LEAST(
             authorized.gross_amount,
             ROUND(authorized.gross_amount * authorized.monthly_fee
               / NULLIF(authorized.monthly_rate, 0))
           ))::bigint AS operator_amount
    FROM authorized_days authorized
  ), inserted AS (
    INSERT INTO property_owner_earnings (
      property_id, owner_profile_id, ownership_kind, ownership_assignment_id,
      room_id, lease_id, payment_id, payment_allocation_id, earning_month,
      service_from, service_until, gross_collected_amount, owner_earned_amount,
      operator_fee_amount, earning_status, policy_id, recognized_at
    )
    SELECT amounts.property_id, amounts.owner_profile_id, amounts.ownership_kind,
           amounts.assignment_id, amounts.room_id, amounts.lease_id, amounts.payment_id,
           amounts.allocation_id, date_trunc('month', amounts.service_day)::date,
           amounts.service_day, amounts.service_day + 1, amounts.gross_amount,
           amounts.gross_amount - amounts.operator_amount, amounts.operator_amount,
           'recognized', amounts.policy_id,
           amounts.service_day::timestamp AT TIME ZONE 'Asia/Jakarta'
    FROM earning_amounts amounts
    WHERE amounts.gross_amount > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO inserted_count FROM inserted;

  RETURN inserted_count;
END;
$$;

-- Backfill only eligible, already delivered service. The function is
-- idempotent, so replaying this migration through the official runner is safe.
DO $$
DECLARE
  property_row RECORD;
BEGIN
  FOR property_row IN SELECT id FROM properties LOOP
    PERFORM recognize_property_owner_earnings(property_row.id);
  END LOOP;
END;
$$;

COMMIT;
