-- KMO-W07D general checkout authority. Additive, deny-by-default, and never
-- backfills a legacy close, invoice, deposit, room, vehicle, or access record.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.occupancies') IS NULL
     OR to_regclass('public.lease_deposit_transactions') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL
     OR to_regclass('public.business_events') IS NULL
     OR to_regclass('public.property_feature_flags') IS NULL
     OR to_regclass('public.files') IS NULL THEN
    RAISE EXCEPTION 'W07D_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE property_feature_flags
  ADD COLUMN IF NOT EXISTS lease_checkout BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='property_feature_flags_checkout_dependency_check'
      AND conrelid='property_feature_flags'::regclass
  ) THEN
    ALTER TABLE property_feature_flags
      ADD CONSTRAINT property_feature_flags_checkout_dependency_check CHECK (
        NOT lease_checkout OR (admin_ux_read AND lease_write)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_feature_flags_checkout_enabled
  ON property_feature_flags(property_id)
  WHERE admin_ux_read AND lease_write AND lease_checkout;

CREATE TABLE IF NOT EXISTS lease_checkout_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  occupancy_id UUID NOT NULL REFERENCES occupancies(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'notice_received',
  effective_date DATE NOT NULL,
  notice_recorded_date DATE NOT NULL,
  notice_reason TEXT NOT NULL,
  notice_exception_reason TEXT,
  scheduled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  handover_recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  handover_recorded_at TIMESTAMPTZ,
  inspection_recorded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  inspection_recorded_at TIMESTAMPTZ,
  inspection_room_status TEXT,
  completion_room_status TEXT,
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_checkout_commands_state_check CHECK (
    state IN ('notice_received','scheduled','inspection_required','settlement_pending','completed','cancelled')
  ),
  CONSTRAINT lease_checkout_commands_notice_reason_check CHECK (
    char_length(trim(notice_reason)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT lease_checkout_commands_notice_check CHECK (
    effective_date >= notice_recorded_date
    AND (effective_date >= notice_recorded_date + 14 OR char_length(trim(COALESCE(notice_exception_reason,''))) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT lease_checkout_commands_scheduled_check CHECK (
    state NOT IN ('scheduled','inspection_required','settlement_pending','completed')
    OR (scheduled_at IS NOT NULL AND scheduled_by_user_id IS NOT NULL)
  ),
  CONSTRAINT lease_checkout_commands_handover_check CHECK (
    state NOT IN ('inspection_required','settlement_pending','completed')
    OR (handover_recorded_at IS NOT NULL AND handover_recorded_by_user_id IS NOT NULL)
  ),
  CONSTRAINT lease_checkout_commands_inspection_check CHECK (
    state NOT IN ('settlement_pending','completed')
    OR (
      inspection_recorded_at IS NOT NULL AND inspection_recorded_by_user_id IS NOT NULL
      AND inspection_room_status IN ('inspection_required','maintenance')
    )
  ),
  CONSTRAINT lease_checkout_commands_completed_check CHECK (
    state <> 'completed' OR (
      completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL
      AND completion_room_status IN ('inspection_required','maintenance')
    )
  ),
  CONSTRAINT lease_checkout_commands_cancelled_check CHECK (
    state <> 'cancelled' OR (
      cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL
      AND char_length(trim(COALESCE(cancellation_reason,''))) BETWEEN 1 AND 2000
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_checkout_commands_open_lease
  ON lease_checkout_commands(lease_id)
  WHERE state IN ('notice_received','scheduled','inspection_required','settlement_pending');
CREATE INDEX IF NOT EXISTS idx_lease_checkout_commands_lease_created
  ON lease_checkout_commands(lease_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lease_checkout_commands_property_state
  ON lease_checkout_commands(property_id,state,effective_date);

CREATE TABLE IF NOT EXISTS lease_checkout_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE CASCADE,
  evidence_category TEXT NOT NULL,
  file_id UUID REFERENCES files(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_checkout_evidence_category_check CHECK (
    evidence_category IN ('keys_access','inventory','parking','inspection','damage','refund')
  ),
  CONSTRAINT lease_checkout_evidence_metadata_object_check CHECK (jsonb_typeof(metadata)='object')
);
CREATE INDEX IF NOT EXISTS idx_lease_checkout_evidence_checkout_category
  ON lease_checkout_evidence(checkout_command_id,evidence_category,recorded_at);

-- This is immutable evidence that permits exactly one issued-invoice credit
-- increase. It is deliberately separate from W07A termination offsets.
CREATE TABLE IF NOT EXISTS lease_checkout_invoice_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  deposit_transaction_id UUID NOT NULL REFERENCES lease_deposit_transactions(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  invoice_credit_before_amount BIGINT NOT NULL CHECK (invoice_credit_before_amount >= 0),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_checkout_invoice_credits_deposit_unique UNIQUE (deposit_transaction_id),
  CONSTRAINT lease_checkout_invoice_credits_checkout_invoice_unique UNIQUE (checkout_command_id,invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_lease_checkout_invoice_credits_invoice
  ON lease_checkout_invoice_credits(invoice_id);

ALTER TABLE lease_deposit_transactions
  ADD COLUMN IF NOT EXISTS refund_due_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_deposit_transactions_refund_due_date_check'
      AND conrelid='lease_deposit_transactions'::regclass
  ) THEN
    ALTER TABLE lease_deposit_transactions
      ADD CONSTRAINT lease_deposit_transactions_refund_due_date_check CHECK (
        refund_due_date IS NULL OR transaction_type='refund'
      );
  END IF;
END $$;

-- Extend the W06 immutable-invoice guard. Only an immutable W07A/W07D credit
-- evidence row can increase credit on an issued invoice; ordinary checkout
-- never creates a payment/allocation or owner-finance record.
CREATE OR REPLACE FUNCTION protect_w06_invoice_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  backed_offset_amount BIGINT;
  offset_credit_before_amount BIGINT;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'W06_INVOICE_IMMUTABLE' USING ERRCODE='check_violation';
  END IF;
  IF OLD.invoice_status <> 'draft' THEN
    SELECT COALESCE(sum(amount),0), COALESCE(min(invoice_credit_before_amount),0)
      INTO backed_offset_amount, offset_credit_before_amount
      FROM (
        SELECT amount,invoice_credit_before_amount FROM contract_settlement_deposit_offsets WHERE invoice_id=OLD.id
        UNION ALL
        SELECT amount,invoice_credit_before_amount FROM lease_checkout_invoice_credits WHERE invoice_id=OLD.id
      ) offset_evidence;
    IF NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.resident_id IS DISTINCT FROM OLD.resident_id
      OR NEW.room_id IS DISTINCT FROM OLD.room_id
      OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
      OR NEW.installment_id IS DISTINCT FROM OLD.installment_id
      OR NEW.invoice_purpose IS DISTINCT FROM OLD.invoice_purpose
      OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.cycle_start_date IS DISTINCT FROM OLD.cycle_start_date
      OR NEW.cycle_end_date IS DISTINCT FROM OLD.cycle_end_date
      OR NEW.snapshot_room_number IS DISTINCT FROM OLD.snapshot_room_number
      OR NEW.snapshot_resident_name IS DISTINCT FROM OLD.snapshot_resident_name
      OR NEW.snapshot_contract_rent_amount IS DISTINCT FROM OLD.snapshot_contract_rent_amount
      OR NEW.credit_amount < OLD.credit_amount
      OR (NEW.credit_amount IS DISTINCT FROM OLD.credit_amount AND (
        backed_offset_amount=0 OR NEW.credit_amount<>offset_credit_before_amount+backed_offset_amount
      ))
    THEN RAISE EXCEPTION 'W06_ISSUED_INVOICE_IMMUTABLE' USING ERRCODE='check_violation'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lease_history_event_type_check' AND conrelid='lease_history'::regclass) THEN
    ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
  END IF;
  ALTER TABLE lease_history ADD CONSTRAINT lease_history_event_type_check CHECK (
    event_type IN (
      'created','updated','invoice_generated','deposit_collected','deposit_refunded','deposit_deducted','closed',
      'transferred_out','transferred_in','transfer_scheduled','transfer_cancelled','transfer_failed',
      'renewal_intent','renewal_approved','renewal_financial_prepared','renewal_activation_authorized','renewed_out','renewed_in','renewal_cancelled','renewal_failed',
      'checkout_notice_received','checkout_scheduled','checkout_handover_recorded','checkout_inspection_recorded','checkout_completed','checkout_cancelled'
    )
  );
END $$;

COMMIT;
