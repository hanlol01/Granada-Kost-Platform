BEGIN;

CREATE OR REPLACE FUNCTION validate_property_owner_earning_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_property UUID;
  assignment_owner UUID;
  assignment_room UUID;
  payment_property UUID;
  policy_property UUID;
BEGIN
  SELECT property_id INTO payment_property FROM payments WHERE id = NEW.payment_id;
  SELECT property_id INTO policy_property FROM property_owner_commercial_policies WHERE id = NEW.policy_id;

  IF payment_property IS NULL OR payment_property <> NEW.property_id
     OR policy_property IS NULL OR policy_property <> NEW.property_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM property_owner_commercial_policies policies
    WHERE policies.id = NEW.policy_id
      AND policies.policy_status = 'active'
      AND policies.effective_from <= NEW.earning_month
      AND (policies.effective_until IS NULL OR NEW.earning_month < policies.effective_until)
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
      AND assignments.effective_from <= NEW.earning_month
      AND (assignments.effective_until IS NULL OR NEW.earning_month < assignments.effective_until);
  ELSE
    SELECT assignments.property_id, assignments.owner_profile_id, assignments.room_id
      INTO assignment_property, assignment_owner, assignment_room
    FROM room_owner_assignments assignments
    WHERE assignments.id = NEW.ownership_assignment_id
      AND assignments.effective_from <= NEW.earning_month
      AND (assignments.effective_until IS NULL OR NEW.earning_month < assignments.effective_until);
  END IF;

  IF assignment_property IS NULL OR assignment_property <> NEW.property_id
     OR assignment_owner <> NEW.owner_profile_id OR assignment_room <> NEW.room_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_ASSIGNMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_earning_authority ON property_owner_earnings;
CREATE TRIGGER trg_validate_property_owner_earning_authority
  BEFORE INSERT ON property_owner_earnings
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_earning_authority();

CREATE OR REPLACE FUNCTION prevent_property_owner_earning_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_EARNING_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_earnings_append_only ON property_owner_earnings;
CREATE TRIGGER trg_property_owner_earnings_append_only
  BEFORE UPDATE OR DELETE ON property_owner_earnings
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_earning_mutation();

CREATE OR REPLACE FUNCTION protect_property_owner_settlement_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.settlement_status IN ('approved', 'paid') THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.settlement_status = 'draft' AND NEW.settlement_status NOT IN ('draft', 'ready_for_review', 'void'))
       OR (OLD.settlement_status = 'ready_for_review' AND NEW.settlement_status NOT IN ('ready_for_review', 'approved', 'void'))
       OR (OLD.settlement_status = 'approved' AND (
         NEW.settlement_status <> 'paid'
         OR NEW.property_id IS DISTINCT FROM OLD.property_id
         OR NEW.owner_profile_id IS DISTINCT FROM OLD.owner_profile_id
         OR NEW.period_start IS DISTINCT FROM OLD.period_start
         OR NEW.period_end IS DISTINCT FROM OLD.period_end
         OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
         OR NEW.owner_amount IS DISTINCT FROM OLD.owner_amount
         OR NEW.operator_fee_amount IS DISTINCT FROM OLD.operator_fee_amount
         OR NEW.reference IS DISTINCT FROM OLD.reference
         OR NEW.notes IS DISTINCT FROM OLD.notes
         OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
       ))
       OR OLD.settlement_status = 'paid' THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_settlement_authority ON property_owner_settlements;
CREATE TRIGGER trg_property_owner_settlement_authority
  BEFORE UPDATE OR DELETE ON property_owner_settlements
  FOR EACH ROW EXECUTE FUNCTION protect_property_owner_settlement_authority();

CREATE OR REPLACE FUNCTION prevent_property_owner_settlement_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_settlement_lines_append_only ON property_owner_settlement_lines;
CREATE TRIGGER trg_property_owner_settlement_lines_append_only
  BEFORE UPDATE OR DELETE ON property_owner_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_settlement_line_mutation();

CREATE TABLE IF NOT EXISTS property_owner_earning_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES property_owner_settlements(id) ON DELETE RESTRICT,
  earning_id UUID REFERENCES property_owner_earnings(id) ON DELETE RESTRICT,
  effective_month DATE NOT NULL,
  adjustment_kind TEXT NOT NULL,
  gross_amount_delta INTEGER NOT NULL,
  owner_amount_delta INTEGER NOT NULL,
  operator_fee_amount_delta INTEGER NOT NULL,
  adjustment_status TEXT NOT NULL DEFAULT 'approved',
  reason TEXT NOT NULL,
  evidence_file_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_earning_adjustments_kind_check CHECK (
    adjustment_kind IN ('reversal', 'refund', 'transfer_proration', 'clawback')
  ),
  CONSTRAINT property_owner_earning_adjustments_amount_check CHECK (
    gross_amount_delta <> 0
    AND owner_amount_delta + operator_fee_amount_delta = gross_amount_delta
  ),
  CONSTRAINT property_owner_earning_adjustments_status_check CHECK (
    adjustment_status = 'approved'
  ),
  CONSTRAINT property_owner_earning_adjustments_effective_month_check CHECK (
    effective_month = date_trunc('month', effective_month)::date
  ),
  CONSTRAINT property_owner_earning_adjustments_reason_check CHECK (
    length(btrim(reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT property_owner_earning_adjustments_evidence_limit_check CHECK (
    cardinality(evidence_file_ids) <= 3
  )
);

CREATE INDEX IF NOT EXISTS idx_property_owner_earning_adjustments_settlement
  ON property_owner_earning_adjustments(settlement_id, created_at);

CREATE TABLE IF NOT EXISTS property_owner_payout_destination_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  destination_kind TEXT NOT NULL,
  destination_ciphertext BYTEA NOT NULL,
  destination_mask TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_payout_destination_snapshots_kind_check CHECK (
    destination_kind IN ('bank_account', 'cash', 'other')
  ),
  CONSTRAINT property_owner_payout_destination_snapshots_ciphertext_check CHECK (
    octet_length(destination_ciphertext) > 0
  ),
  CONSTRAINT property_owner_payout_destination_snapshots_mask_check CHECK (
    destination_mask ~ '\\*' AND length(btrim(destination_mask)) BETWEEN 5 AND 150
  )
);

CREATE OR REPLACE FUNCTION prevent_property_owner_payout_destination_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_DESTINATION_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_payout_destination_snapshots_append_only
  ON property_owner_payout_destination_snapshots;
CREATE TRIGGER trg_property_owner_payout_destination_snapshots_append_only
  BEFORE UPDATE OR DELETE ON property_owner_payout_destination_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_payout_destination_snapshot_mutation();

CREATE TABLE IF NOT EXISTS property_owner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES property_owner_settlements(id) ON DELETE RESTRICT,
  payout_kind TEXT NOT NULL DEFAULT 'payout',
  reversal_of_payout_id UUID REFERENCES property_owner_payouts(id) ON DELETE RESTRICT,
  payout_amount INTEGER NOT NULL,
  payout_method TEXT NOT NULL,
  payout_reference TEXT NOT NULL,
  payout_destination_snapshot_id UUID NOT NULL REFERENCES property_owner_payout_destination_snapshots(id) ON DELETE RESTRICT,
  evidence_file_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_payouts_kind_check CHECK (payout_kind IN ('payout', 'reversal')),
  CONSTRAINT property_owner_payouts_amount_check CHECK (payout_amount > 0),
  CONSTRAINT property_owner_payouts_method_check CHECK (
    payout_method IN ('bank_transfer', 'cash', 'other')
  ),
  CONSTRAINT property_owner_payouts_reference_check CHECK (length(btrim(payout_reference)) BETWEEN 3 AND 150),
  CONSTRAINT property_owner_payouts_reversal_check CHECK (
    (payout_kind = 'payout' AND reversal_of_payout_id IS NULL)
    OR (payout_kind = 'reversal' AND reversal_of_payout_id IS NOT NULL)
  ),
  CONSTRAINT property_owner_payouts_evidence_limit_check CHECK (cardinality(evidence_file_ids) <= 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owner_payouts_reversal
  ON property_owner_payouts(reversal_of_payout_id) WHERE reversal_of_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_owner_payouts_settlement_recorded
  ON property_owner_payouts(settlement_id, recorded_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_settlements_owner_period_unique'
      AND conrelid = 'property_owner_settlements'::regclass
  ) THEN
    ALTER TABLE property_owner_settlements
      ADD CONSTRAINT property_owner_settlements_owner_period_unique
      UNIQUE (property_id, owner_profile_id, period_start, period_end);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_settlements_paid_requires_payout_timestamp'
      AND conrelid = 'property_owner_settlements'::regclass
  ) THEN
    ALTER TABLE property_owner_settlements
      ADD CONSTRAINT property_owner_settlements_paid_requires_payout_timestamp CHECK (
        (settlement_status = 'paid' AND paid_at IS NOT NULL)
        OR (settlement_status <> 'paid' AND paid_at IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'property_owner_settlements_approval_actor_required'
      AND conrelid = 'property_owner_settlements'::regclass
  ) THEN
    ALTER TABLE property_owner_settlements
      ADD CONSTRAINT property_owner_settlements_approval_actor_required CHECK (
        settlement_status NOT IN ('approved', 'paid') OR approved_by_user_id IS NOT NULL
      );
  END IF;
END $$;

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
  SELECT property_id, owner_profile_id, earning_month
    INTO earning_scope
  FROM property_owner_earnings
  WHERE id = NEW.earning_id;

  IF settlement_scope.property_id IS NULL
     OR earning_scope.property_id IS NULL
     OR settlement_scope.property_id <> earning_scope.property_id
     OR settlement_scope.owner_profile_id <> earning_scope.owner_profile_id
     OR earning_scope.earning_month < settlement_scope.period_start
     OR earning_scope.earning_month > settlement_scope.period_end
     OR settlement_scope.settlement_status NOT IN ('draft', 'ready_for_review') THEN
    IF earning_scope.earning_month IS NOT NULL
       AND (earning_scope.earning_month < settlement_scope.period_start
            OR earning_scope.earning_month > settlement_scope.period_end) THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_PERIOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_LINE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_settlement_line_authority ON property_owner_settlement_lines;
CREATE TRIGGER trg_validate_property_owner_settlement_line_authority
  BEFORE INSERT ON property_owner_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_settlement_line_authority();

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

  IF settlement_scope.property_id IS NULL
     OR settlement_scope.property_id <> NEW.property_id
     OR settlement_scope.owner_profile_id <> NEW.owner_profile_id
     OR NEW.effective_month < settlement_scope.period_start
     OR NEW.effective_month > settlement_scope.period_end
     OR settlement_scope.settlement_status NOT IN ('draft', 'ready_for_review') THEN
    IF NEW.effective_month < settlement_scope.period_start
       OR NEW.effective_month > settlement_scope.period_end THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_PERIOD_MISMATCH' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.earning_id IS NOT NULL THEN
    SELECT property_id, owner_profile_id INTO earning_scope
    FROM property_owner_earnings WHERE id = NEW.earning_id;
    IF earning_scope.property_id IS NULL
       OR earning_scope.property_id <> NEW.property_id
       OR earning_scope.owner_profile_id <> NEW.owner_profile_id THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_EARNING_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_adjustment_authority ON property_owner_earning_adjustments;
CREATE TRIGGER trg_validate_property_owner_adjustment_authority
  BEFORE INSERT ON property_owner_earning_adjustments
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_adjustment_authority();

CREATE OR REPLACE FUNCTION prevent_property_owner_adjustment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_ADJUSTMENT_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_adjustments_append_only ON property_owner_earning_adjustments;
CREATE TRIGGER trg_property_owner_adjustments_append_only
  BEFORE UPDATE OR DELETE ON property_owner_earning_adjustments
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_adjustment_mutation();

CREATE OR REPLACE FUNCTION reconcile_property_owner_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  totals RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.settlement_status = 'ready_for_review'
     AND NEW.settlement_status = 'approved' THEN
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

DROP TRIGGER IF EXISTS trg_reconcile_property_owner_settlement ON property_owner_settlements;
CREATE TRIGGER trg_reconcile_property_owner_settlement
  BEFORE UPDATE ON property_owner_settlements
  FOR EACH ROW EXECUTE FUNCTION reconcile_property_owner_settlement();

CREATE OR REPLACE FUNCTION validate_property_owner_settlement_paid_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  paid_owner_amount INTEGER;
BEGIN
  IF OLD.settlement_status = 'approved' AND NEW.settlement_status = 'paid' THEN
    SELECT COALESCE(SUM(
      CASE WHEN payout_kind = 'payout' THEN payout_amount ELSE -payout_amount END
    ), 0)::integer
      INTO paid_owner_amount
    FROM property_owner_payouts
    WHERE settlement_id = NEW.id;

    IF NEW.paid_at IS NULL OR paid_owner_amount <> NEW.owner_amount THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_PAYOUT_RECONCILIATION_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_settlement_paid_authority ON property_owner_settlements;
CREATE TRIGGER trg_validate_property_owner_settlement_paid_authority
  BEFORE UPDATE ON property_owner_settlements
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_settlement_paid_authority();

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
     OR settlement_scope.settlement_status <> 'approved' THEN
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

DROP TRIGGER IF EXISTS trg_validate_property_owner_payout_authority ON property_owner_payouts;
CREATE TRIGGER trg_validate_property_owner_payout_authority
  BEFORE INSERT ON property_owner_payouts
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_payout_authority();

CREATE OR REPLACE FUNCTION prevent_property_owner_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_APPEND_ONLY' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_payouts_append_only ON property_owner_payouts;
CREATE TRIGGER trg_property_owner_payouts_append_only
  BEFORE UPDATE OR DELETE ON property_owner_payouts
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_payout_mutation();

COMMIT;
