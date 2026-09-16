-- Owner-sponsored occupancy: zero room rent with an independently collected
-- Kostation management fee. Existing rental agreements keep their semantics.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.onboarding_commitments') IS NULL
     OR to_regclass('public.property_owner_profiles') IS NULL
     OR to_regclass('public.property_management_fee_versions') IS NULL THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_OCCUPANCY_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS commercial_mode TEXT NOT NULL DEFAULT 'rent';

ALTER TABLE onboarding_commitments
  ADD COLUMN IF NOT EXISTS commercial_mode TEXT NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS sponsoring_owner_profile_id UUID
    REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS management_fee_payer TEXT,
  ADD COLUMN IF NOT EXISTS management_fee_payer_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_sponsorship_reason TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_monthly_management_fee BIGINT,
  ADD COLUMN IF NOT EXISTS projected_management_fee_amount BIGINT;

ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_commercial_mode_check;
ALTER TABLE leases ADD CONSTRAINT leases_commercial_mode_check CHECK (
  commercial_mode IN ('rent','owner_sponsored')
);

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_commercial_mode_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_commercial_mode_check CHECK (
    commercial_mode IN ('rent','owner_sponsored')
  );

ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_custom_pricing_snapshot_check;
ALTER TABLE leases ADD CONSTRAINT leases_custom_pricing_snapshot_check CHECK (
  contract_rent_amount IS NULL OR (
    commercial_mode = 'rent'
    AND term_months BETWEEN 1 AND 120
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
  ) OR (
    commercial_mode = 'owner_sponsored'
    AND term_months BETWEEN 1 AND 120
    AND contract_rent_amount = 0
    AND snapshot_monthly_price = 0
    AND snapshot_reference_monthly_price > 0
    AND pricing_source = 'owner_sponsored'
    AND pricing_agreed_by_user_id IS NOT NULL
    AND pricing_agreed_at IS NOT NULL
  )
);

ALTER TABLE onboarding_commitments
  DROP CONSTRAINT IF EXISTS onboarding_commitments_custom_pricing_snapshot_check;
ALTER TABLE onboarding_commitments
  ADD CONSTRAINT onboarding_commitments_custom_pricing_snapshot_check CHECK (
    (
      commercial_mode = 'rent'
      AND snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
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
    ) OR (
      commercial_mode = 'owner_sponsored'
      AND snapshot_pricing_tier IN ('short_stay', 'medium_stay', 'long_stay')
      AND snapshot_reference_monthly_price > 0
      AND snapshot_monthly_price = 0
      AND contract_rent_amount = 0
      AND dp_required_amount = 0
      AND dp_verified_amount = 0
      AND booking_fee_paid_amount = 0
      AND security_deposit_required_amount = 0
      AND security_deposit_funded_amount = 0
      AND pricing_source = 'owner_sponsored'
      AND sponsoring_owner_profile_id IS NOT NULL
      AND management_fee_payer IN ('resident','owner','other')
      AND (management_fee_payer <> 'other'
        OR char_length(trim(COALESCE(management_fee_payer_name,''))) BETWEEN 2 AND 160)
      AND char_length(trim(COALESCE(owner_sponsorship_reason,''))) BETWEEN 3 AND 500
      AND snapshot_monthly_management_fee > 0
      AND projected_management_fee_amount = snapshot_monthly_management_fee * term_months
      AND pricing_agreed_by_user_id IS NOT NULL
      AND pricing_agreed_at IS NOT NULL
    )
  );

CREATE TABLE IF NOT EXISTS owner_sponsored_lease_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL UNIQUE REFERENCES leases(id) ON DELETE RESTRICT,
  onboarding_commitment_id UUID NOT NULL UNIQUE
    REFERENCES onboarding_commitments(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  ownership_kind TEXT NOT NULL,
  ownership_assignment_id UUID NOT NULL,
  management_fee_payer TEXT NOT NULL,
  management_fee_payer_name TEXT,
  sponsorship_reason TEXT NOT NULL,
  snapshot_monthly_management_fee BIGINT NOT NULL,
  projected_management_fee_amount BIGINT NOT NULL,
  term_status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT owner_sponsored_terms_kind_check CHECK (ownership_kind IN ('building','room')),
  CONSTRAINT owner_sponsored_terms_payer_check CHECK (
    management_fee_payer IN ('resident','owner','other')
  ),
  CONSTRAINT owner_sponsored_terms_payer_name_check CHECK (
    management_fee_payer <> 'other'
    OR char_length(trim(COALESCE(management_fee_payer_name,''))) BETWEEN 2 AND 160
  ),
  CONSTRAINT owner_sponsored_terms_reason_check CHECK (
    char_length(trim(sponsorship_reason)) BETWEEN 3 AND 500
  ),
  CONSTRAINT owner_sponsored_terms_money_check CHECK (
    snapshot_monthly_management_fee > 0
    AND projected_management_fee_amount > 0
  ),
  CONSTRAINT owner_sponsored_terms_status_check CHECK (
    term_status IN ('active','completed','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_owner_sponsored_terms_owner_status
  ON owner_sponsored_lease_terms(property_id,owner_profile_id,term_status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_sponsored_terms_resident
  ON owner_sponsored_lease_terms(property_id,resident_id,created_at DESC);

CREATE OR REPLACE FUNCTION validate_owner_sponsored_lease_term()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lease_scope RECORD;
  assignment_scope RECORD;
BEGIN
  SELECT property_id,resident_id,room_id,onboarding_commitment_id,commercial_mode,start_date
    INTO lease_scope
    FROM leases WHERE id=NEW.lease_id;
  IF lease_scope.property_id IS NULL
     OR lease_scope.property_id<>NEW.property_id
     OR lease_scope.resident_id<>NEW.resident_id
     OR lease_scope.room_id<>NEW.room_id
     OR lease_scope.onboarding_commitment_id<>NEW.onboarding_commitment_id
     OR lease_scope.commercial_mode<>'owner_sponsored' THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_LEASE_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;

  IF NEW.ownership_kind='building' THEN
    SELECT assignment.property_id,assignment.owner_profile_id,room.id AS room_id
      INTO assignment_scope
      FROM building_owner_assignments assignment
      JOIN rooms room ON room.building_id=assignment.building_id
     WHERE assignment.id=NEW.ownership_assignment_id
       AND assignment.assignment_status IN ('active','scheduled')
       AND assignment.effective_from<=lease_scope.start_date
       AND (assignment.effective_until IS NULL OR lease_scope.start_date<assignment.effective_until)
       AND room.id=NEW.room_id;
  ELSE
    SELECT assignment.property_id,assignment.owner_profile_id,assignment.room_id
      INTO assignment_scope
      FROM room_owner_assignments assignment
     WHERE assignment.id=NEW.ownership_assignment_id
       AND assignment.assignment_status IN ('active','scheduled')
       AND assignment.effective_from<=lease_scope.start_date
       AND (assignment.effective_until IS NULL OR lease_scope.start_date<assignment.effective_until);
  END IF;
  IF assignment_scope.property_id IS NULL
     OR assignment_scope.property_id<>NEW.property_id
     OR assignment_scope.owner_profile_id<>NEW.owner_profile_id
     OR assignment_scope.room_id<>NEW.room_id THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_ASSIGNMENT_SCOPE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_owner_sponsored_lease_term ON owner_sponsored_lease_terms;
CREATE TRIGGER trg_validate_owner_sponsored_lease_term
  BEFORE INSERT OR UPDATE ON owner_sponsored_lease_terms
  FOR EACH ROW EXECUTE FUNCTION validate_owner_sponsored_lease_term();

CREATE OR REPLACE FUNCTION protect_active_owner_sponsorship_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM owner_sponsored_lease_terms term
    JOIN leases lease ON lease.id=term.lease_id
    WHERE term.ownership_kind=CASE WHEN TG_TABLE_NAME='building_owner_assignments' THEN 'building' ELSE 'room' END
      AND term.ownership_assignment_id=OLD.id
      AND term.term_status='active'
      AND lease.lease_status IN ('awaiting_activation','active')
      AND (
        NEW.assignment_status='released'
        OR (NEW.effective_until IS NOT NULL AND NEW.effective_until<=lease.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'OWNER_SPONSORED_ACTIVE_ASSIGNMENT_RELEASE_BLOCKED'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sponsored_building_assignment ON building_owner_assignments;
CREATE TRIGGER trg_protect_sponsored_building_assignment
  BEFORE UPDATE OF assignment_status,effective_until ON building_owner_assignments
  FOR EACH ROW EXECUTE FUNCTION protect_active_owner_sponsorship_assignment();
DROP TRIGGER IF EXISTS trg_protect_sponsored_room_assignment ON room_owner_assignments;
CREATE TRIGGER trg_protect_sponsored_room_assignment
  BEFORE UPDATE OF assignment_status,effective_until ON room_owner_assignments
  FOR EACH ROW EXECUTE FUNCTION protect_active_owner_sponsorship_assignment();

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_w06_purpose_check;
ALTER TABLE payments ADD CONSTRAINT payments_w06_purpose_check CHECK (
  payment_purpose IS NULL
  OR payment_purpose IN ('rent','dp','security_deposit','other_charge','management_fee')
);
ALTER TABLE payment_proofs DROP CONSTRAINT IF EXISTS payment_proofs_w06_purpose_check;
ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_w06_purpose_check CHECK (
  payment_purpose IN ('rent','dp','security_deposit','other_charge','management_fee')
);

CREATE OR REPLACE FUNCTION next_financial_transaction_code(
  p_code_family TEXT,
  p_transaction_purpose TEXT,
  p_occurred_at TIMESTAMPTZ DEFAULT now()
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  normalized_family TEXT := upper(btrim(p_code_family));
  normalized_purpose TEXT := upper(btrim(p_transaction_purpose));
  local_date DATE := (COALESCE(p_occurred_at, now()) AT TIME ZONE 'Asia/Jakarta')::date;
  next_value BIGINT;
BEGIN
  IF normalized_family IS NULL OR normalized_family NOT IN ('TRX', 'REF', 'BTL') THEN
    RAISE EXCEPTION 'Unsupported financial transaction family: %', p_code_family;
  END IF;
  IF normalized_purpose IS NULL OR normalized_purpose NOT IN (
    'BOOKING','DP','PELUNASAN-AWAL','SEWA','LUNAS','DEPOSIT','TAMBAH-DEPOSIT',
    'TAGIHAN-LAIN','CHECKOUT','KELEBIHAN-BAYAR','CANCEL','BIAYA-PENGELOLAAN'
  ) THEN
    RAISE EXCEPTION 'Unsupported financial transaction purpose: %', p_transaction_purpose;
  END IF;
  INSERT INTO financial_transaction_sequences(code_family,sequence_date,last_value)
  VALUES(normalized_family,local_date,1)
  ON CONFLICT(code_family,sequence_date)
  DO UPDATE SET last_value=financial_transaction_sequences.last_value+1,updated_at=now()
  RETURNING last_value INTO next_value;
  IF next_value>999999 THEN
    RAISE EXCEPTION 'Daily financial transaction sequence exhausted for % on %',normalized_family,local_date;
  END IF;
  RETURN format('%s-%s-%s-%s',normalized_family,to_char(local_date,'YYYYMMDD'),
    lpad(next_value::text,6,'0'),normalized_purpose);
END;
$$;

CREATE OR REPLACE VIEW owner_sponsored_management_fee_progress AS
WITH projected AS (
  SELECT term.id AS term_id,
         COALESCE(sum(COALESCE(fee.monthly_fee_amount,term.snapshot_monthly_management_fee)),0)::bigint
           AS projected_amount
  FROM owner_sponsored_lease_terms term
  JOIN leases lease ON lease.id=term.lease_id
  CROSS JOIN LATERAL generate_series(0,lease.term_months-1) AS month_index(value)
  LEFT JOIN LATERAL (
    SELECT version.monthly_fee_amount
    FROM property_management_fee_versions version
    WHERE version.property_id=term.property_id
      AND version.effective_date<=(lease.start_date+(month_index.value||' months')::interval)::date
    ORDER BY version.effective_date DESC,version.id DESC LIMIT 1
  ) fee ON true
  GROUP BY term.id
), paid AS (
  SELECT term.id AS term_id,
         COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_status='verified'),0)::bigint
           AS verified_paid_amount,
         COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_status='pending_confirmation'),0)::bigint
           AS pending_amount
  FROM owner_sponsored_lease_terms term
  LEFT JOIN payments payment ON payment.property_id=term.property_id
    AND payment.lease_id=term.lease_id AND payment.payment_purpose='management_fee'
  GROUP BY term.id
)
SELECT term.*,
       projected.projected_amount AS current_projected_management_fee_amount,
       paid.verified_paid_amount,
       paid.pending_amount,
       GREATEST(
         projected.projected_amount-paid.verified_paid_amount-paid.pending_amount,
         0
       )::bigint AS remaining_amount,
       CASE
         WHEN paid.verified_paid_amount>projected.projected_amount THEN 'overpaid'
         WHEN paid.verified_paid_amount=projected.projected_amount THEN 'paid'
         WHEN paid.verified_paid_amount+paid.pending_amount>0 THEN 'partially_paid'
         ELSE 'unpaid'
       END AS payment_status
FROM owner_sponsored_lease_terms term
JOIN projected ON projected.term_id=term.id
JOIN paid ON paid.term_id=term.id;

COMMIT;
