-- M5 final-settlement authority for a confirmed physical lease exit. Rent,
-- deposit, deductions, explicit deposit offset, refund, and amount due remain
-- separately inspectable and immutable after approval.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_deposit_transactions') IS NULL
     OR to_regclass('public.leases') IS NULL THEN
    RAISE EXCEPTION 'M5_FINAL_SETTLEMENT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

-- M5 records the explicit deposit-offset authority and the immutable final
-- settlement snapshot in the existing checkout evidence stream.
ALTER TABLE lease_checkout_evidence
  DROP CONSTRAINT IF EXISTS lease_checkout_evidence_category_check;

ALTER TABLE lease_checkout_evidence
  ADD CONSTRAINT lease_checkout_evidence_category_check CHECK (
    evidence_category IN (
      'keys_access','inventory','parking','inspection','damage','refund',
      'deposit_offset','settlement'
    )
  );

CREATE TABLE IF NOT EXISTS lease_exit_final_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('resident_early_termination','normal_expiry')),
  actual_checkout_date DATE NOT NULL,
  contract_rent_amount BIGINT NOT NULL CHECK (contract_rent_amount >= 0),
  verified_rent_payment_amount BIGINT NOT NULL CHECK (verified_rent_payment_amount >= 0),
  existing_invoice_credit_amount BIGINT NOT NULL CHECK (existing_invoice_credit_amount >= 0),
  recognized_rent_credit_amount BIGINT NOT NULL CHECK (recognized_rent_credit_amount >= 0),
  earned_rent_amount BIGINT NOT NULL CHECK (earned_rent_amount >= 0),
  earned_rent_amount_due_before_deposit_offset BIGINT NOT NULL CHECK (earned_rent_amount_due_before_deposit_offset >= 0),
  contract_outstanding_amount BIGINT NOT NULL CHECK (contract_outstanding_amount >= 0),
  approved_short_notice_charge BIGINT NOT NULL CHECK (approved_short_notice_charge >= 0),
  rent_refundable_amount BIGINT NOT NULL CHECK (rent_refundable_amount >= 0),
  rent_amount_due_before_deposit_offset BIGINT NOT NULL CHECK (rent_amount_due_before_deposit_offset >= 0),
  deposit_liability_amount BIGINT NOT NULL CHECK (deposit_liability_amount >= 0),
  deposit_deduction_amount BIGINT NOT NULL CHECK (deposit_deduction_amount >= 0),
  deposit_rent_offset_amount BIGINT NOT NULL CHECK (deposit_rent_offset_amount >= 0),
  refundable_deposit_amount BIGINT NOT NULL CHECK (refundable_deposit_amount >= 0),
  recommended_refund_amount BIGINT NOT NULL CHECK (recommended_refund_amount >= 0),
  final_refund_amount BIGINT NOT NULL CHECK (final_refund_amount >= 0),
  final_rent_refund_amount BIGINT NOT NULL CHECK (final_rent_refund_amount >= 0),
  final_deposit_refund_amount BIGINT NOT NULL CHECK (final_deposit_refund_amount >= 0),
  refund_adjustment_amount BIGINT NOT NULL CHECK (refund_adjustment_amount >= 0),
  refund_adjustment_reason TEXT,
  refund_adjustment_evidence_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  amount_due BIGINT NOT NULL CHECK (amount_due >= 0),
  decision_status TEXT NOT NULL CHECK (decision_status IN ('refund_pending','amount_due','closed')),
  approved_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_exit_final_settlements_checkout_unique UNIQUE (checkout_command_id),
  CONSTRAINT lease_exit_final_settlements_rent_credit_components_check CHECK (
    recognized_rent_credit_amount = verified_rent_payment_amount + existing_invoice_credit_amount
    AND earned_rent_amount_due_before_deposit_offset
      = GREATEST(earned_rent_amount - recognized_rent_credit_amount,0)
  ),
  CONSTRAINT lease_exit_final_settlements_refund_limit_check CHECK (
    final_refund_amount <= recommended_refund_amount
  ),
  CONSTRAINT lease_exit_final_settlements_adjustment_reason_check CHECK (
    final_refund_amount = recommended_refund_amount
    OR (
      char_length(trim(COALESCE(refund_adjustment_reason,''))) BETWEEN 3 AND 2000
      AND refund_adjustment_evidence_file_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_exit_final_settlements_refund_components_check CHECK (
    final_rent_refund_amount + final_deposit_refund_amount = final_refund_amount
    AND final_deposit_refund_amount <= refundable_deposit_amount
    AND refund_adjustment_amount = recommended_refund_amount - final_refund_amount
  ),
  CONSTRAINT lease_exit_final_settlements_deposit_components_check CHECK (
    deposit_deduction_amount + deposit_rent_offset_amount + refundable_deposit_amount
      = deposit_liability_amount
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_exit_final_settlements_property_status
  ON lease_exit_final_settlements(property_id,decision_status,approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_lease_exit_final_settlements_lease
  ON lease_exit_final_settlements(lease_id,approved_at DESC);

CREATE TABLE IF NOT EXISTS lease_exit_invoice_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type='unearned_rent_termination'),
  amount BIGINT NOT NULL CHECK (amount > 0),
  invoice_credit_before_amount BIGINT NOT NULL CHECK (invoice_credit_before_amount >= 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_exit_invoice_adjustments_checkout_invoice_unique UNIQUE (checkout_command_id,invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_lease_exit_invoice_adjustments_lease
  ON lease_exit_invoice_adjustments(lease_id,created_at DESC);

CREATE TABLE IF NOT EXISTS lease_exit_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  final_settlement_id UUID NOT NULL REFERENCES lease_exit_final_settlements(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  deposit_transaction_id UUID REFERENCES lease_deposit_transactions(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (refund_status IN ('pending','settled','waived','reversed')),
  refund_due_date DATE NOT NULL,
  payment_method TEXT,
  external_reference TEXT,
  evidence_file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  settlement_reason TEXT,
  settled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  settled_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_exit_refunds_settlement_unique UNIQUE (final_settlement_id),
  CONSTRAINT lease_exit_refunds_completion_check CHECK (
    refund_status='pending'
    OR (
      settled_by_user_id IS NOT NULL AND settled_at IS NOT NULL
      AND (
        (refund_status='settled' AND payment_method IN ('cash','bank_transfer','qris','ewallet','other')
          AND char_length(trim(COALESCE(external_reference,''))) > 0 AND evidence_file_id IS NOT NULL)
        OR (refund_status='waived' AND char_length(trim(COALESCE(settlement_reason,''))) BETWEEN 3 AND 2000)
        OR refund_status='reversed'
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_exit_refunds_property_status_due
  ON lease_exit_refunds(property_id,refund_status,refund_due_date);

COMMIT;
