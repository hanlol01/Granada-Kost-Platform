-- Lease-settlement M3: automatic activation cutoff, physical check-in
-- separation, retryable activation attempts, and no-show reconciliation.
-- Existing/legacy leases deliberately receive no lifecycle backfill.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.rooms') IS NULL
     OR to_regclass('public.occupancies') IS NULL
     OR to_regclass('public.lease_settlement_policy_snapshots') IS NULL
     OR to_regclass('public.property_feature_flags') IS NULL
     OR to_regclass('public.business_events') IS NULL THEN
    RAISE EXCEPTION 'LEASE_ACTIVATION_V2_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

-- A contract may be active while the resident has not physically arrived. The
-- room remains unavailable in this state, but no occupancy row exists yet.
DO $$
DECLARE
  status_constraint RECORD;
BEGIN
  FOR status_constraint IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'rooms'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%room_status%'
       AND pg_get_constraintdef(oid) ILIKE '%vacant%'
       AND pg_get_constraintdef(oid) ILIKE '%occupied%'
  LOOP
    EXECUTE format('ALTER TABLE rooms DROP CONSTRAINT %I', status_constraint.conname);
  END LOOP;

  ALTER TABLE rooms
    ADD CONSTRAINT rooms_status_check CHECK (room_status IN (
      'vacant', 'reserved', 'awaiting_check_in', 'occupied', 'maintenance',
      'inactive', 'requires_review', 'inspection_required'
    ));
END;
$$;

ALTER TABLE property_feature_flags
  ADD COLUMN IF NOT EXISTS lease_activation_scheduler BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'property_feature_flags_activation_dependency_check'
       AND conrelid = 'property_feature_flags'::regclass
  ) THEN
    ALTER TABLE property_feature_flags
      ADD CONSTRAINT property_feature_flags_activation_dependency_check CHECK (
        NOT lease_activation_scheduler OR (admin_ux_read AND lease_write)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_property_feature_flags_activation_enabled
  ON property_feature_flags(property_id)
  WHERE admin_ux_read AND lease_write AND lease_activation_scheduler;

CREATE TABLE IF NOT EXISTS lease_activation_lifecycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'scheduled',
  cutoff_at TIMESTAMPTZ NOT NULL,
  cutoff_evaluated_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  check_in_due_at TIMESTAMPTZ NOT NULL,
  checked_in_at TIMESTAMPTZ,
  attention_code TEXT,
  attention_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_activation_lifecycles_lease_unique UNIQUE (lease_id),
  CONSTRAINT lease_activation_lifecycles_state_check CHECK (
    state IN (
      'scheduled', 'activation_attention_required', 'awaiting_check_in',
      'check_in_confirmation_required', 'checked_in'
    )
  ),
  CONSTRAINT lease_activation_lifecycles_attention_detail_check CHECK (
    jsonb_typeof(attention_detail) = 'object'
  ),
  CONSTRAINT lease_activation_lifecycles_dates_check CHECK (
    check_in_due_at > cutoff_at
  ),
  CONSTRAINT lease_activation_lifecycles_state_data_check CHECK (
    (state = 'scheduled' AND activated_at IS NULL AND checked_in_at IS NULL)
    OR (
      state = 'activation_attention_required'
      AND cutoff_evaluated_at IS NOT NULL
      AND activated_at IS NULL
      AND checked_in_at IS NULL
      AND attention_code IS NOT NULL
    )
    OR (
      state IN ('awaiting_check_in', 'check_in_confirmation_required')
      AND activated_at IS NOT NULL
      AND checked_in_at IS NULL
    )
    OR (state = 'checked_in' AND activated_at IS NOT NULL AND checked_in_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_activation_lifecycles_cutoff
  ON lease_activation_lifecycles(property_id, cutoff_at, lease_id)
  WHERE state = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_lease_activation_lifecycles_check_in_due
  ON lease_activation_lifecycles(property_id, check_in_due_at, lease_id)
  WHERE state = 'awaiting_check_in';

CREATE TABLE IF NOT EXISTS lease_activation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  lifecycle_id UUID NOT NULL REFERENCES lease_activation_lifecycles(id) ON DELETE RESTRICT,
  attempt_key TEXT NOT NULL,
  attempt_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  failure_code TEXT,
  failure_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_activation_attempts_key_unique UNIQUE (attempt_key),
  CONSTRAINT lease_activation_attempts_type_check CHECK (
    attempt_type IN (
      'automatic_cutoff', 'technical_retry', 'manual_exception',
      'no_show_reconciler', 'physical_check_in'
    )
  ),
  CONSTRAINT lease_activation_attempts_outcome_check CHECK (
    outcome IN (
      'activated', 'business_attention', 'technical_failure',
      'already_satisfied', 'confirmation_required', 'checked_in'
    )
  ),
  CONSTRAINT lease_activation_attempts_failure_detail_check CHECK (
    jsonb_typeof(failure_detail) = 'object'
  ),
  CONSTRAINT lease_activation_attempts_failure_check CHECK (
    outcome NOT IN ('business_attention', 'technical_failure') OR failure_code IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_activation_attempts_timeline
  ON lease_activation_attempts(property_id, lease_id, occurred_at, id);

-- Extend the existing safe lease timeline vocabulary. These events explain
-- state changes; lifecycle and occupancy records remain authoritative.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'lease_history_event_type_check'
       AND conrelid = 'lease_history'::regclass
  ) THEN
    ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
  END IF;

  ALTER TABLE lease_history
    ADD CONSTRAINT lease_history_event_type_check CHECK (
      event_type IN (
        'created','updated','invoice_generated','deposit_collected','deposit_refunded','deposit_deducted','closed',
        'transferred_out','transferred_in','transfer_scheduled','transfer_cancelled','transfer_failed',
        'renewal_intent','renewal_approved','renewal_financial_prepared','renewal_activation_authorized','renewed_out','renewed_in','renewal_cancelled','renewal_failed',
        'checkout_notice_received','checkout_scheduled','checkout_handover_recorded','checkout_inspection_recorded','checkout_completed','checkout_cancelled',
        'activated','activation_attention_required','check_in_confirmation_required','check_in_confirmed'
      )
    );
END;
$$;

COMMIT;
