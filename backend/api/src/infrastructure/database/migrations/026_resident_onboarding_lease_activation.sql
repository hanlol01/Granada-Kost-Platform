-- KMO-W05 resident onboarding commitment and explicit lease activation authority.
-- Additive and transactional; no legacy lease/occupancy rows are rewritten.
BEGIN;

ALTER TABLE booking_leads
  ADD COLUMN IF NOT EXISTS resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_commitment_id UUID,
  ADD COLUMN IF NOT EXISTS leased_at TIMESTAMPTZ;

ALTER TABLE booking_leads
  DROP CONSTRAINT IF EXISTS booking_leads_status_check;

ALTER TABLE booking_leads
  ADD CONSTRAINT booking_leads_status_check CHECK (
    status IN (
      'new', 'contacted', 'visit_scheduled', 'negotiating', 'awaiting_dp',
      'onboarding', 'leased', 'converted', 'rejected', 'expired', 'cancelled'
    )
  );

ALTER TABLE leases
  ALTER COLUMN occupancy_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS booking_lead_id UUID REFERENCES booking_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_commitment_id UUID,
  ADD COLUMN IF NOT EXISTS term_months SMALLINT,
  ADD COLUMN IF NOT EXISTS payment_plan_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_rent_amount BIGINT,
  ADD COLUMN IF NOT EXISTS dp_required_amount BIGINT,
  ADD COLUMN IF NOT EXISTS security_deposit_required_amount BIGINT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

ALTER TABLE leases
  DROP CONSTRAINT IF EXISTS leases_status_check;

ALTER TABLE leases
  ADD CONSTRAINT leases_status_check CHECK (
    lease_status IN ('draft', 'awaiting_activation', 'active', 'ended', 'completed', 'cancelled', 'transferred')
  );

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_term_months_check') THEN
    ALTER TABLE leases ADD CONSTRAINT leases_term_months_check CHECK (term_months IS NULL OR term_months >= 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_payment_plan_check') THEN
    ALTER TABLE leases ADD CONSTRAINT leases_payment_plan_check CHECK (
    payment_plan_type IS NULL OR payment_plan_type IN ('annual_full', 'two_month_installments')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_commercial_obligations_check') THEN
    ALTER TABLE leases ADD CONSTRAINT leases_commercial_obligations_check CHECK (
    contract_rent_amount IS NULL OR (
      contract_rent_amount >= 0
      AND COALESCE(dp_required_amount, 0) >= 0
      AND COALESCE(security_deposit_required_amount, 0) >= 0
    )
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS onboarding_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  booking_lead_id UUID REFERENCES booking_leads(id) ON DELETE SET NULL,
  hold_id UUID REFERENCES booking_lead_holds(id) ON DELETE SET NULL,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  lease_id UUID REFERENCES leases(id) ON DELETE SET NULL,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  gender TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  term_months SMALLINT NOT NULL,
  billing_cycle TEXT NOT NULL,
  payment_plan_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  contract_rent_amount BIGINT NOT NULL,
  dp_required_amount BIGINT NOT NULL,
  dp_verified_amount BIGINT NOT NULL DEFAULT 0,
  security_deposit_required_amount BIGINT NOT NULL,
  security_deposit_funded_amount BIGINT NOT NULL DEFAULT 0,
  accepted_terms_version TEXT NOT NULL,
  signed_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  committed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_commitments_status_check CHECK (
    status IN ('draft', 'awaiting_documents', 'awaiting_financials', 'ready_to_commit', 'committed', 'completed', 'cancelled')
  ),
  CONSTRAINT onboarding_commitments_term_check CHECK (term_months >= 12),
  CONSTRAINT onboarding_commitments_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly')),
  CONSTRAINT onboarding_commitments_plan_check CHECK (payment_plan_type IN ('annual_full', 'two_month_installments')),
  CONSTRAINT onboarding_commitments_dates_check CHECK (end_date >= start_date),
  CONSTRAINT onboarding_commitments_amounts_check CHECK (
    contract_rent_amount >= 0
    AND dp_required_amount >= 0
    AND dp_verified_amount >= 0
    AND security_deposit_required_amount >= 0
    AND security_deposit_funded_amount >= 0
  ),
  CONSTRAINT onboarding_commitments_terms_check CHECK (char_length(trim(accepted_terms_version)) BETWEEN 1 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_commitments_active_room
  ON onboarding_commitments(room_id)
  WHERE status IN ('draft', 'awaiting_documents', 'awaiting_financials', 'ready_to_commit', 'committed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_commitments_active_lead
  ON onboarding_commitments(booking_lead_id)
  WHERE booking_lead_id IS NOT NULL AND status IN ('draft', 'awaiting_documents', 'awaiting_financials', 'ready_to_commit', 'committed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_commitments_active_lease
  ON onboarding_commitments(lease_id)
  WHERE lease_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_commitments_property_status
  ON onboarding_commitments(property_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_commitments_resident
  ON onboarding_commitments(resident_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS lease_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  sequence_number SMALLINT NOT NULL,
  coverage_start_date DATE NOT NULL,
  coverage_end_date DATE NOT NULL,
  due_date DATE NOT NULL,
  scheduled_amount BIGINT NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  installment_status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_installments_sequence_check CHECK (sequence_number >= 1),
  CONSTRAINT lease_installments_dates_check CHECK (coverage_end_date >= coverage_start_date),
  CONSTRAINT lease_installments_amount_check CHECK (scheduled_amount >= 0),
  CONSTRAINT lease_installments_status_check CHECK (installment_status IN ('scheduled', 'issued', 'partially_paid', 'paid', 'void')),
  CONSTRAINT lease_installments_sequence_unique UNIQUE (lease_id, sequence_number),
  CONSTRAINT lease_installments_period_unique UNIQUE (lease_id, coverage_start_date)
);

CREATE INDEX IF NOT EXISTS idx_lease_installments_property_due
  ON lease_installments(property_id, due_date, installment_status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leases_onboarding_commitment_fk') THEN
    ALTER TABLE leases ADD CONSTRAINT leases_onboarding_commitment_fk
      FOREIGN KEY (onboarding_commitment_id) REFERENCES onboarding_commitments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_leads_onboarding_commitment_fk') THEN
    ALTER TABLE booking_leads ADD CONSTRAINT booking_leads_onboarding_commitment_fk
      FOREIGN KEY (onboarding_commitment_id) REFERENCES onboarding_commitments(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE booking_lead_holds
  ADD COLUMN IF NOT EXISTS onboarding_commitment_id UUID REFERENCES onboarding_commitments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_reason TEXT;

ALTER TABLE residents
  DROP CONSTRAINT IF EXISTS residents_status_check;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'residents_status_check') THEN
    ALTER TABLE residents ADD CONSTRAINT residents_status_check
      CHECK (resident_status IN ('draft', 'pending_activation', 'active', 'inactive', 'archived'));
  END IF;
END $$;

COMMIT;
