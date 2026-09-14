-- Immutable custom-lease commercial snapshots and lease-settlement v3.
-- Additive only: legacy agreements keep their original monetary authority and
-- existing lease_settlement_v2 rows remain readable without reinterpretation.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.onboarding_commitments') IS NULL
     OR to_regclass('public.booking_lead_payment_commitments') IS NULL
     OR to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.lease_settlement_checkpoints') IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_LEASE_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS snapshot_reference_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS pricing_source TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreement_reason TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_at TIMESTAMPTZ;

ALTER TABLE onboarding_commitments
  ADD COLUMN IF NOT EXISTS snapshot_pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_reference_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS snapshot_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS pricing_source TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreement_reason TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_at TIMESTAMPTZ;

ALTER TABLE booking_lead_payment_commitments
  ADD COLUMN IF NOT EXISTS snapshot_pricing_tier TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_reference_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS snapshot_monthly_price BIGINT,
  ADD COLUMN IF NOT EXISTS pricing_source TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreement_reason TEXT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pricing_agreed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM onboarding_commitments
    WHERE contract_rent_amount % term_months <> 0
  ) OR EXISTS (
    SELECT 1
    FROM booking_lead_payment_commitments
    WHERE contract_rent_amount IS NOT NULL
      AND contract_rent_amount % term_months <> 0
  ) THEN
    RAISE EXCEPTION 'CUSTOM_LEASE_LEGACY_CONTRACT_NOT_DIVISIBLE_BY_TERM'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Migration 063 deliberately introduced these guards as NOT VALID because
-- legacy onboarding rows can contain a Booking Fee that was recorded alongside
-- a fully paid DP. PostgreSQL still checks a NOT VALID constraint whenever an
-- existing row is updated, so the commercial-snapshot backfill below would be
-- blocked even though it does not change any payment amount. Temporarily remove
-- the guards and restore the same NOT VALID forward-write protection after the
-- metadata-only backfill. Historical monetary facts remain untouched.
ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_rent_credit_limit_check,
  DROP CONSTRAINT IF EXISTS onboarding_commitments_security_deposit_limit_check;

UPDATE leases
SET snapshot_reference_monthly_price = snapshot_monthly_price,
    pricing_source = 'standard',
    pricing_agreement_reason = NULL,
    pricing_agreed_by_user_id = COALESCE(pricing_agreed_by_user_id, created_by_user_id),
    pricing_agreed_at = COALESCE(pricing_agreed_at, signed_at, created_at)
WHERE contract_rent_amount IS NOT NULL
  AND term_months IS NOT NULL
  AND snapshot_monthly_price IS NOT NULL
  AND pricing_source IS NULL;

UPDATE onboarding_commitments
SET snapshot_pricing_tier = CASE
      WHEN term_months <= 5 THEN 'short_stay'
      WHEN term_months <= 11 THEN 'medium_stay'
      ELSE 'long_stay'
    END,
    snapshot_reference_monthly_price = contract_rent_amount / term_months,
    snapshot_monthly_price = contract_rent_amount / term_months,
    pricing_source = 'standard',
    pricing_agreement_reason = NULL,
    pricing_agreed_by_user_id = COALESCE(pricing_agreed_by_user_id, created_by_user_id),
    pricing_agreed_at = COALESCE(pricing_agreed_at, committed_at, created_at)
WHERE pricing_source IS NULL;

ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_rent_credit_limit_check
    CHECK (dp_verified_amount + booking_fee_paid_amount <= contract_rent_amount)
    NOT VALID,
  ADD CONSTRAINT onboarding_commitments_security_deposit_limit_check
    CHECK (
      security_deposit_funded_amount <= contract_rent_amount / NULLIF(term_months, 0)
    )
    NOT VALID;

UPDATE booking_lead_payment_commitments
SET snapshot_pricing_tier = CASE
      WHEN term_months <= 5 THEN 'short_stay'
      WHEN term_months <= 11 THEN 'medium_stay'
      ELSE 'long_stay'
    END,
    snapshot_reference_monthly_price = contract_rent_amount / term_months,
    snapshot_monthly_price = contract_rent_amount / term_months,
    pricing_source = 'standard',
    pricing_agreement_reason = NULL,
    pricing_agreed_by_user_id = COALESCE(pricing_agreed_by_user_id, created_by_user_id),
    pricing_agreed_at = COALESCE(pricing_agreed_at, created_at)
WHERE contract_rent_amount IS NOT NULL
  AND pricing_source IS NULL;

ALTER TABLE leases
  DROP CONSTRAINT IF EXISTS leases_term_months_check,
  DROP CONSTRAINT IF EXISTS leases_custom_pricing_snapshot_check;
ALTER TABLE leases
  ADD CONSTRAINT leases_term_months_check CHECK (
    term_months IS NULL OR term_months BETWEEN 1 AND 120
  ),
  ADD CONSTRAINT leases_custom_pricing_snapshot_check CHECK (
    contract_rent_amount IS NULL OR (
      term_months BETWEEN 1 AND 120
      AND snapshot_monthly_price > 0
      AND snapshot_reference_monthly_price > 0
      AND contract_rent_amount = snapshot_monthly_price * term_months
      AND pricing_source IN ('standard', 'negotiated')
      AND pricing_agreed_at IS NOT NULL
      AND (
        (pricing_source = 'standard'
          AND snapshot_monthly_price = snapshot_reference_monthly_price
          AND pricing_agreement_reason IS NULL)
        OR
        (pricing_source = 'negotiated'
          AND pricing_agreed_by_user_id IS NOT NULL
          AND pricing_agreement_reason IS NOT NULL
          AND char_length(trim(pricing_agreement_reason)) BETWEEN 3 AND 500)
      )
    )
  );

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_term_check,
  DROP CONSTRAINT IF EXISTS onboarding_commitments_custom_pricing_snapshot_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_term_check CHECK (term_months BETWEEN 1 AND 120),
  ADD CONSTRAINT onboarding_commitments_custom_pricing_snapshot_check CHECK (
    snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
    AND snapshot_reference_monthly_price > 0
    AND snapshot_monthly_price > 0
    AND contract_rent_amount = snapshot_monthly_price * term_months
    AND pricing_source IN ('standard', 'negotiated')
    AND pricing_agreed_at IS NOT NULL
    AND (
      (pricing_source = 'standard'
        AND snapshot_monthly_price = snapshot_reference_monthly_price
        AND pricing_agreement_reason IS NULL)
      OR
      (pricing_source = 'negotiated'
        AND pricing_agreed_by_user_id IS NOT NULL
        AND pricing_agreement_reason IS NOT NULL
        AND char_length(trim(pricing_agreement_reason)) BETWEEN 3 AND 500)
    )
  );

ALTER TABLE booking_lead_payment_commitments
  DROP CONSTRAINT IF EXISTS booking_lead_payment_commitments_term_months_check,
  DROP CONSTRAINT IF EXISTS booking_lead_payment_commitments_custom_pricing_snapshot_check;
ALTER TABLE booking_lead_payment_commitments
  ADD CONSTRAINT booking_lead_payment_commitments_term_months_check CHECK (
    term_months BETWEEN 1 AND 120
  ),
  ADD CONSTRAINT booking_lead_payment_commitments_custom_pricing_snapshot_check CHECK (
    contract_rent_amount IS NULL OR (
      snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
      AND snapshot_reference_monthly_price > 0
      AND snapshot_monthly_price > 0
      AND contract_rent_amount = snapshot_monthly_price * term_months
      AND pricing_source IN ('standard', 'negotiated')
      AND pricing_agreed_at IS NOT NULL
      AND (
        (pricing_source = 'standard'
          AND snapshot_monthly_price = snapshot_reference_monthly_price
          AND pricing_agreement_reason IS NULL)
        OR
        (pricing_source = 'negotiated'
          AND pricing_agreed_by_user_id IS NOT NULL
          AND pricing_agreement_reason IS NOT NULL
          AND char_length(trim(pricing_agreement_reason)) BETWEEN 3 AND 500)
      )
    )
  );

ALTER TABLE lease_settlement_policy_snapshots
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_version_check,
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_term_check,
  DROP CONSTRAINT IF EXISTS lease_settlement_policy_snapshots_deadline_check;
ALTER TABLE lease_settlement_policy_snapshots
  ADD CONSTRAINT lease_settlement_policy_snapshots_version_check CHECK (
    policy_version IN ('lease_settlement_v2', 'lease_settlement_v3')
  ),
  ADD CONSTRAINT lease_settlement_policy_snapshots_term_check CHECK (
    (policy_version = 'lease_settlement_v2' AND term_months IN (3, 6, 12))
    OR (policy_version = 'lease_settlement_v3' AND term_months BETWEEN 1 AND 120)
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
  );

ALTER TABLE lease_settlement_checkpoints
  DROP CONSTRAINT IF EXISTS lease_settlement_checkpoints_sequence_check;
ALTER TABLE lease_settlement_checkpoints
  ADD CONSTRAINT lease_settlement_checkpoints_sequence_check CHECK (
    (checkpoint_code = 'checkpoint_1' AND checkpoint_sequence = 1)
    OR (checkpoint_code = 'checkpoint_2' AND checkpoint_sequence = 2)
    OR (checkpoint_code = 'final_settlement' AND checkpoint_sequence IN (1, 2, 3))
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
         OR (snapshot_policy_version = 'lease_settlement_v3' AND snapshot_term_months < 4)
       ))
       OR (NEW.checkpoint_code = 'final_settlement'
           AND NEW.checkpoint_sequence <> expected_final_sequence)
       OR (NEW.checkpoint_code = 'checkpoint_1'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 2)
       OR (NEW.checkpoint_code = 'checkpoint_2'
           AND NEW.minimum_required_amount <> snapshot_monthly_rent_amount * 3) THEN
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
    SELECT property_id, lease_id, policy_snapshot_id, due_at
      INTO checkpoint_property, checkpoint_lease, checkpoint_snapshot, checkpoint_due_at
      FROM lease_settlement_checkpoints
     WHERE id = NEW.checkpoint_id;
    IF snapshot_property IS DISTINCT FROM NEW.property_id
       OR snapshot_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_property IS DISTINCT FROM NEW.property_id
       OR checkpoint_lease IS DISTINCT FROM NEW.lease_id
       OR checkpoint_snapshot IS DISTINCT FROM NEW.policy_snapshot_id
       OR checkpoint_due_at IS DISTINCT FROM NEW.original_due_at THEN
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

CREATE OR REPLACE FUNCTION attach_contract_paid_commercial_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lease RECORD;
BEGIN
  SELECT term_months,
         snapshot_reference_monthly_price,
         snapshot_monthly_price,
         pricing_source
    INTO v_lease
    FROM leases
   WHERE id = NEW.lease_id
     AND property_id = NEW.property_id;

  IF v_lease.term_months IS NULL
     OR v_lease.snapshot_reference_monthly_price IS NULL
     OR v_lease.snapshot_monthly_price IS NULL
     OR v_lease.pricing_source IS NULL THEN
    RAISE EXCEPTION 'CONTRACT_PAID_COMMERCIAL_SNAPSHOT_MISSING'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.safe_snapshot := COALESCE(NEW.safe_snapshot, '{}'::jsonb) || jsonb_build_object(
    'leaseTermMonths', v_lease.term_months,
    'referenceMonthlyPrice', v_lease.snapshot_reference_monthly_price,
    'agreedMonthlyPrice', v_lease.snapshot_monthly_price,
    'pricingSource', v_lease.pricing_source
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_contract_paid_documents_commercial_snapshot
  ON lease_contract_paid_documents;
CREATE TRIGGER trg_lease_contract_paid_documents_commercial_snapshot
BEFORE INSERT ON lease_contract_paid_documents
FOR EACH ROW EXECUTE FUNCTION attach_contract_paid_commercial_snapshot();

COMMIT;
