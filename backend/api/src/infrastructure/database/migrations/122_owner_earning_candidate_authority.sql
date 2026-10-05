-- Keep the immutable payment/invoice history and the earning insertion guard intact.
-- Narrow automatic recognition to the same room/lease/resident/property authority.
-- No backfill or historical earning rewrite occurs in this migration.
BEGIN;

CREATE OR REPLACE FUNCTION recognize_property_owner_rent_earnings(
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
      -- Match the insertion authority before distributing days. A historical
      -- invoice from a previous room is retained, not attributed to the new room.
      AND payments.lease_id = leases.id
      AND payments.resident_id = leases.resident_id
      AND invoices.property_id = payments.property_id
      AND invoices.lease_id = leases.id
      AND invoices.room_id = leases.room_id
      AND (invoices.occupancy_id IS NULL OR invoices.occupancy_id = leases.occupancy_id)
      AND invoices.cycle_start_date IS NOT NULL
      AND invoices.cycle_end_date IS NOT NULL
      AND leases.property_id = payments.property_id
      AND occupancies.property_id = payments.property_id
      AND occupancies.room_id = invoices.room_id
      AND occupancies.resident_id = leases.resident_id
      AND allocations.allocated_amount > 0
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

COMMENT ON FUNCTION recognize_property_owner_rent_earnings(UUID, DATE) IS
  'H08 recognition candidate authority: historical invoices from a different current room are not newly recognized; insertion validation and recorded earnings remain unchanged.';

COMMIT;
