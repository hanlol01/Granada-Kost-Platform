BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE property_owner_earnings
  ADD COLUMN IF NOT EXISTS service_from DATE,
  ADD COLUMN IF NOT EXISTS service_until DATE,
  ADD COLUMN IF NOT EXISTS payment_allocation_id UUID REFERENCES payment_allocations(id) ON DELETE RESTRICT;

ALTER TABLE property_owner_earnings
  DROP CONSTRAINT IF EXISTS property_owner_earnings_unique_event;

DROP INDEX IF EXISTS uq_property_owner_earnings_legacy_event;
CREATE UNIQUE INDEX uq_property_owner_earnings_legacy_event
  ON property_owner_earnings(owner_profile_id, room_id, payment_id, earning_month, earning_status)
  WHERE service_from IS NULL AND service_until IS NULL AND payment_allocation_id IS NULL;

DROP INDEX IF EXISTS uq_property_owner_earnings_service_event;
CREATE UNIQUE INDEX uq_property_owner_earnings_service_event
  ON property_owner_earnings(payment_allocation_id, room_id, service_from, earning_status)
  WHERE payment_allocation_id IS NOT NULL AND service_from IS NOT NULL AND service_until IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_earnings_service_coverage_pair_check'
      AND conrelid = 'property_owner_earnings'::regclass
  ) THEN
    ALTER TABLE property_owner_earnings
      ADD CONSTRAINT property_owner_earnings_service_coverage_pair_check CHECK (
        (service_from IS NULL AND service_until IS NULL)
        OR (service_from IS NOT NULL AND service_until IS NOT NULL AND service_from < service_until)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_earnings_service_coverage_month_check'
      AND conrelid = 'property_owner_earnings'::regclass
  ) THEN
    ALTER TABLE property_owner_earnings
      ADD CONSTRAINT property_owner_earnings_service_coverage_month_check CHECK (
        service_from IS NULL
        OR (
          service_from >= earning_month
          AND service_until <= (earning_month + INTERVAL '1 month')::date
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_earnings_service_coverage_no_overlap'
      AND conrelid = 'property_owner_earnings'::regclass
  ) THEN
    ALTER TABLE property_owner_earnings
      ADD CONSTRAINT property_owner_earnings_service_coverage_no_overlap
      EXCLUDE USING gist (
        property_id WITH =,
        room_id WITH =,
        earning_month WITH =,
        payment_allocation_id WITH =,
        daterange(service_from, service_until, '[)') WITH &&
      ) WHERE (
        earning_status = 'recognized'
        AND payment_allocation_id IS NOT NULL
        AND service_from IS NOT NULL
        AND service_until IS NOT NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_owner_earnings_service_coverage
  ON property_owner_earnings(property_id, room_id, earning_month, service_from, service_until)
  WHERE earning_status = 'recognized' AND service_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_owner_earnings_payment_allocation
  ON property_owner_earnings(payment_allocation_id, earning_status)
  WHERE payment_allocation_id IS NOT NULL;

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
         allocations.invoice_id AS allocation_invoice_id,
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
  SELECT property_id, room_id INTO lease_scope
  FROM leases
  WHERE id = NEW.lease_id;

  IF allocation_scope.allocation_id IS NULL
     OR allocation_scope.allocation_payment_id <> NEW.payment_id
     OR allocation_scope.allocation_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.payment_property_id <> NEW.property_id
     OR allocation_scope.payment_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.payment_resident_id IS DISTINCT FROM allocation_scope.lease_resident_id
     OR allocation_scope.payment_purpose IS DISTINCT FROM 'rent'
     OR allocation_scope.payment_status IS DISTINCT FROM 'verified'
     OR allocation_scope.allocation_target_type IS DISTINCT FROM 'invoice'
     OR allocation_scope.allocation_purpose IS DISTINCT FROM 'rent'
     OR allocation_scope.allocation_status IS DISTINCT FROM 'active'
     OR allocation_scope.allocated_amount IS NULL
     OR allocation_scope.allocated_amount <= 0
     OR allocation_scope.invoice_property_id <> NEW.property_id
     OR allocation_scope.invoice_room_id <> NEW.room_id
     OR allocation_scope.invoice_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.invoice_occupancy_id IS DISTINCT FROM allocation_scope.lease_occupancy_id
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
       SELECT 1
       FROM payment_reversal_allocations reversals
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
       (allocation_scope.cycle_end_date + 1),
       COALESCE(allocation_scope.lease_end_date + 1, 'infinity'::date),
       COALESCE(allocation_scope.occupancy_end_date + 1, 'infinity'::date)
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM property_owner_commercial_policies policies
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

  IF assignment_property IS NULL
     OR assignment_property <> NEW.property_id
     OR assignment_owner <> NEW.owner_profile_id
     OR assignment_room <> NEW.room_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_ASSIGNMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_property_owner_service_coverage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allocation_scope RECORD;
  allocation_coverage RECORD;
  service_from_date DATE;
  service_until_date DATE;
BEGIN
  IF NEW.earning_status <> 'recognized' THEN
    RETURN NULL;
  END IF;

  SELECT
    allocations.id AS allocation_id,
    allocations.allocated_amount,
    allocations.allocation_status,
    payments.id AS payment_id,
    payments.property_id AS payment_property_id,
    payments.lease_id AS payment_lease_id,
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
    leases.occupancy_id AS lease_occupancy_id,
    leases.lease_status,
    leases.start_date AS lease_start_date,
    leases.end_date AS lease_end_date,
    leases.activated_at,
    occupancies.property_id AS occupancy_property_id,
    occupancies.room_id AS occupancy_room_id,
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

  IF allocation_scope.allocation_id IS NULL
     OR allocation_scope.payment_id <> NEW.payment_id
     OR allocation_scope.payment_property_id <> NEW.property_id
     OR allocation_scope.payment_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.allocation_status IS DISTINCT FROM 'active'
     OR allocation_scope.payment_purpose IS DISTINCT FROM 'rent'
     OR allocation_scope.payment_status IS DISTINCT FROM 'verified'
     OR allocation_scope.invoice_property_id <> NEW.property_id
     OR allocation_scope.invoice_room_id <> NEW.room_id
     OR allocation_scope.invoice_lease_id IS DISTINCT FROM NEW.lease_id
     OR allocation_scope.invoice_occupancy_id IS DISTINCT FROM allocation_scope.lease_occupancy_id
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
     OR allocation_scope.occupancy_status NOT IN ('active', 'ended')
     OR EXISTS (
       SELECT 1
       FROM payment_reversal_allocations reversals
       WHERE reversals.original_allocation_id = NEW.payment_allocation_id
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  service_from_date := GREATEST(
    allocation_scope.cycle_start_date,
    allocation_scope.lease_start_date,
    COALESCE(allocation_scope.activated_at::date, allocation_scope.lease_start_date),
    allocation_scope.occupancy_start_date
  );
  service_until_date := LEAST(
    (allocation_scope.cycle_end_date + 1),
    COALESCE(allocation_scope.lease_end_date + 1, 'infinity'::date),
    COALESCE(allocation_scope.occupancy_end_date + 1, 'infinity'::date)
  );

  IF service_from_date >= service_until_date THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT
    MIN(earnings.service_from) AS service_from,
    MAX(earnings.service_until) AS service_until,
    COALESCE(SUM(earnings.service_until - earnings.service_from), 0)::integer AS covered_days,
    COALESCE(SUM(earnings.gross_collected_amount), 0)::bigint AS gross_amount,
    COALESCE(SUM(earnings.owner_earned_amount), 0)::bigint AS owner_amount,
    COALESCE(SUM(earnings.operator_fee_amount), 0)::bigint AS operator_fee_amount
    INTO allocation_coverage
  FROM property_owner_earnings earnings
  WHERE earnings.payment_allocation_id = NEW.payment_allocation_id
    AND earnings.earning_status = 'recognized'
    AND earnings.service_from IS NOT NULL
    AND earnings.service_until IS NOT NULL;

  IF allocation_coverage.service_from IS DISTINCT FROM service_from_date
     OR allocation_coverage.service_until IS DISTINCT FROM service_until_date
     OR allocation_coverage.covered_days <> (service_until_date - service_from_date) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_GAP' USING ERRCODE = '23514';
  END IF;

  IF allocation_coverage.gross_amount <> allocation_scope.allocated_amount
     OR allocation_coverage.owner_amount + allocation_coverage.operator_fee_amount <> allocation_coverage.gross_amount THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_RECONCILIATION_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_property_owner_service_coverage ON property_owner_earnings;
CREATE CONSTRAINT TRIGGER trg_reconcile_property_owner_service_coverage
  AFTER INSERT ON property_owner_earnings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION reconcile_property_owner_service_coverage();

CREATE OR REPLACE FUNCTION validate_property_owner_settlement_line_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  settlement_scope RECORD;
  earning_scope RECORD;
BEGIN
  SELECT property_id, owner_profile_id, settlement_status, period_start, period_end
    INTO settlement_scope
  FROM property_owner_settlements
  WHERE id = NEW.settlement_id
  FOR KEY SHARE;
  SELECT property_id, owner_profile_id, earning_month, service_from, service_until
    INTO earning_scope
  FROM property_owner_earnings
  WHERE id = NEW.earning_id;

  IF settlement_scope.property_id IS NULL
     OR earning_scope.property_id IS NULL
     OR settlement_scope.property_id <> earning_scope.property_id
     OR settlement_scope.owner_profile_id <> earning_scope.owner_profile_id
     OR earning_scope.service_from IS NULL
     OR earning_scope.service_until IS NULL
     OR earning_scope.service_from < settlement_scope.period_start
     OR earning_scope.service_until > (settlement_scope.period_end + 1)
     OR settlement_scope.settlement_status NOT IN ('draft', 'ready_for_review') THEN
    IF earning_scope.service_from IS NULL OR earning_scope.service_until IS NULL THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_SERVICE_COVERAGE_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF earning_scope.service_from < settlement_scope.period_start
       OR earning_scope.service_until > (settlement_scope.period_end + 1) THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_PERIOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_property_owner_adjustment_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  settlement_scope RECORD;
  earning_scope RECORD;
BEGIN
  SELECT property_id, owner_profile_id, settlement_status, period_start, period_end
    INTO settlement_scope
  FROM property_owner_settlements
  WHERE id = NEW.settlement_id
  FOR KEY SHARE;
  SELECT property_id, owner_profile_id, earning_month, service_from, service_until
    INTO earning_scope
  FROM property_owner_earnings
  WHERE id = NEW.earning_id;

  IF NEW.earning_id IS NULL
     OR earning_scope.property_id IS NULL
     OR earning_scope.property_id <> NEW.property_id
     OR earning_scope.owner_profile_id <> NEW.owner_profile_id
     OR earning_scope.service_from IS NULL
     OR earning_scope.service_until IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_SERVICE_COVERAGE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF settlement_scope.property_id IS NULL
     OR settlement_scope.property_id <> NEW.property_id
     OR settlement_scope.owner_profile_id <> NEW.owner_profile_id
     OR earning_scope.service_from < settlement_scope.period_start
     OR earning_scope.service_until > (settlement_scope.period_end + 1)
     OR NEW.effective_month <> earning_scope.earning_month
     OR settlement_scope.settlement_status NOT IN ('draft', 'ready_for_review') THEN
    IF earning_scope.service_from < settlement_scope.period_start
       OR earning_scope.service_until > (settlement_scope.period_end + 1)
       OR NEW.effective_month <> earning_scope.earning_month THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_PERIOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_property_owner_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  totals RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.settlement_status = 'ready_for_review'
     AND NEW.settlement_status = 'approved' THEN
    IF EXISTS (
      SELECT 1
      FROM property_owner_settlement_lines lines
      JOIN property_owner_earnings earnings ON earnings.id = lines.earning_id
      WHERE lines.settlement_id = NEW.id
        AND (earnings.service_from IS NULL OR earnings.service_until IS NULL)
    ) THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_SERVICE_COVERAGE_REQUIRED' USING ERRCODE = '23514';
    END IF;

    SELECT
      COALESCE((
        SELECT SUM(earnings.gross_collected_amount)
        FROM property_owner_settlement_lines lines
        JOIN property_owner_earnings earnings ON earnings.id = lines.earning_id
        WHERE lines.settlement_id = NEW.id
      ), 0) + COALESCE((
        SELECT SUM(adjustments.gross_amount_delta)
        FROM property_owner_earning_adjustments adjustments
        WHERE adjustments.settlement_id = NEW.id AND adjustments.adjustment_status = 'approved'
      ), 0) AS gross_amount,
      COALESCE((
        SELECT SUM(earnings.owner_earned_amount)
        FROM property_owner_settlement_lines lines
        JOIN property_owner_earnings earnings ON earnings.id = lines.earning_id
        WHERE lines.settlement_id = NEW.id
      ), 0) + COALESCE((
        SELECT SUM(adjustments.owner_amount_delta)
        FROM property_owner_earning_adjustments adjustments
        WHERE adjustments.settlement_id = NEW.id AND adjustments.adjustment_status = 'approved'
      ), 0) AS owner_amount,
      COALESCE((
        SELECT SUM(earnings.operator_fee_amount)
        FROM property_owner_settlement_lines lines
        JOIN property_owner_earnings earnings ON earnings.id = lines.earning_id
        WHERE lines.settlement_id = NEW.id
      ), 0) + COALESCE((
        SELECT SUM(adjustments.operator_fee_amount_delta)
        FROM property_owner_earning_adjustments adjustments
        WHERE adjustments.settlement_id = NEW.id AND adjustments.adjustment_status = 'approved'
      ), 0) AS operator_fee_amount
    INTO totals;

    IF totals.gross_amount <> NEW.gross_amount
       OR totals.owner_amount <> NEW.owner_amount
       OR totals.operator_fee_amount <> NEW.operator_fee_amount THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_RECONCILIATION_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_property_owner_payout_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  settlement_scope RECORD;
  original_payout RECORD;
  destination_scope RECORD;
  payable_remainder INTEGER;
BEGIN
  SELECT property_id, owner_profile_id, settlement_status, owner_amount
    INTO settlement_scope
  FROM property_owner_settlements
  WHERE id = NEW.settlement_id
  FOR UPDATE;

  IF settlement_scope.property_id IS NULL
     OR settlement_scope.property_id <> NEW.property_id
     OR settlement_scope.owner_profile_id <> NEW.owner_profile_id
     OR settlement_scope.settlement_status <> 'approved'
     OR EXISTS (
       SELECT 1
       FROM property_owner_settlement_lines lines
       JOIN property_owner_earnings earnings ON earnings.id = lines.earning_id
       WHERE lines.settlement_id = NEW.settlement_id
         AND (earnings.service_from IS NULL OR earnings.service_until IS NULL)
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_SETTLEMENT_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  SELECT property_id, owner_profile_id
    INTO destination_scope
  FROM property_owner_payout_destination_snapshots
  WHERE id = NEW.payout_destination_snapshot_id
  FOR KEY SHARE;

  IF destination_scope.property_id IS NULL
     OR destination_scope.property_id <> NEW.property_id
     OR destination_scope.owner_profile_id <> NEW.owner_profile_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_DESTINATION_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.payout_kind = 'reversal' THEN
    SELECT property_id, owner_profile_id, settlement_id, payout_kind, payout_amount
      INTO original_payout
    FROM property_owner_payouts
    WHERE id = NEW.reversal_of_payout_id;
    IF original_payout.property_id IS NULL
       OR original_payout.property_id <> NEW.property_id
       OR original_payout.owner_profile_id <> NEW.owner_profile_id
       OR original_payout.settlement_id <> NEW.settlement_id
       OR original_payout.payout_kind <> 'payout'
       OR original_payout.payout_amount <> NEW.payout_amount THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_REVERSAL_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT settlement_scope.owner_amount - COALESCE(SUM(
      CASE WHEN payout_kind = 'payout' THEN payout_amount ELSE -payout_amount END
    ), 0)::integer
      INTO payable_remainder
    FROM property_owner_payouts
    WHERE settlement_id = NEW.settlement_id;
    IF NEW.payout_amount > payable_remainder THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
