BEGIN;

-- A lead commitment records what an operator has agreed with a prospect.  It
-- is intentionally not a W06 payment ledger row: materialisation is only
-- allowed once a resident onboarding commitment is created.
CREATE TABLE IF NOT EXISTS booking_lead_payment_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  booking_lead_id UUID NOT NULL UNIQUE REFERENCES booking_leads(id) ON DELETE RESTRICT,
  hold_id UUID NOT NULL UNIQUE REFERENCES booking_lead_holds(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('booking_fee', 'down_payment', 'full_settlement')),
  rent_credit_amount BIGINT NOT NULL CHECK (rent_credit_amount >= 0),
  security_deposit_amount BIGINT NOT NULL DEFAULT 0 CHECK (security_deposit_amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'pending_confirmation')),
  payment_note TEXT NULL CHECK (payment_note IS NULL OR char_length(trim(payment_note)) <= 500),
  payment_evidence_file_ids UUID[] NOT NULL DEFAULT '{}',
  start_date DATE NOT NULL,
  term_months SMALLINT NOT NULL CHECK (term_months >= 3 AND term_months <= 120),
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  payment_plan_type TEXT NOT NULL CHECK (payment_plan_type IN ('monthly_installments', 'two_month_installments', 'annual_full')),
  materialized_onboarding_commitment_id UUID NULL REFERENCES onboarding_commitments(id) ON DELETE RESTRICT,
  materialized_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_lead_payment_commitments_booking_fee_minimum CHECK (
    payment_type <> 'booking_fee' OR rent_credit_amount >= 1000000
  ),
  CONSTRAINT booking_lead_payment_commitments_full_settlement_positive CHECK (
    payment_type <> 'full_settlement' OR rent_credit_amount > 0
  ),
  CONSTRAINT booking_lead_payment_commitments_materialized_pair CHECK (
    (materialized_onboarding_commitment_id IS NULL AND materialized_at IS NULL)
    OR (materialized_onboarding_commitment_id IS NOT NULL AND materialized_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_booking_lead_payment_commitments_property_created
  ON booking_lead_payment_commitments(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_lead_payment_commitments_room
  ON booking_lead_payment_commitments(property_id, room_id);

COMMIT;
