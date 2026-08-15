-- KMO-W07C lease renewal: explicit successor terms, activation authorization,
-- and auditable pending renewal commands. This migration is additive and never
-- backfills or rewrites lease, occupancy, payment, allocation, deposit, or
-- owner-finance history.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.leases') IS NULL
     OR to_regclass('public.lease_installments') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL
     OR to_regclass('public.business_events') IS NULL
     OR to_regclass('public.property_feature_flags') IS NULL THEN
    RAISE EXCEPTION 'W07C_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE = 'undefined_table';
  END IF;
END $$;

-- A renewal is deliberately distinct from the W07B transfer predecessor link.
-- A cancelled, never-activated successor remains historical evidence, while a
-- new intent may subsequently be created for its still-active predecessor.
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS renewed_from_lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leases_active_renewal_successor
  ON leases(renewed_from_lease_id)
  WHERE renewed_from_lease_id IS NOT NULL AND lease_status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_leases_renewed_from
  ON leases(renewed_from_lease_id)
  WHERE renewed_from_lease_id IS NOT NULL;

-- Canonical occupancy authority is preserved: leases_unique_occupancy remains,
-- and each lease term keeps its own distinct occupancy row. A renewal cutover
-- closes the predecessor occupancy and opens a new contiguous successor
-- occupancy for the same resident and room in one transaction, so the physical
-- stay is continuous through contiguous occupancy records rather than a shared
-- occupancy row. Active room/resident uniqueness stays enforced by the
-- existing partial indexes on occupancies and leases.

-- Property and process gates are deny-by-default. Renewal deliberately does
-- not depend on the transfer canary: the two lifecycle commands are separate.
ALTER TABLE property_feature_flags
  ADD COLUMN IF NOT EXISTS lease_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lease_renewal_scheduler BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='property_feature_flags_renewal_dependency_check'
      AND conrelid='property_feature_flags'::regclass
  ) THEN
    ALTER TABLE property_feature_flags
      ADD CONSTRAINT property_feature_flags_renewal_dependency_check CHECK (
        (NOT lease_renewal OR (admin_ux_read AND lease_write))
        AND (NOT lease_renewal_scheduler OR lease_renewal)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_feature_flags_renewal_scheduler_enabled
  ON property_feature_flags(property_id)
  WHERE admin_ux_read AND lease_write AND lease_renewal AND lease_renewal_scheduler;

-- `draft` is the H-60 intent. Approval creates an immutable, linked successor
-- in awaiting_activation state. Financial preparation and explicit activation
-- authorization are durable gates within the approved state; no timer can turn
-- either into activation. `activated`, `cancelled`, and `failed` are terminal.
CREATE TABLE IF NOT EXISTS lease_renewal_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  predecessor_lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  successor_lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  requested_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  commercial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'draft',
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  financial_prepared_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  financial_prepared_at TIMESTAMPTZ,
  first_invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  activation_authorized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activation_authorized_at TIMESTAMPTZ,
  activated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  failure_code TEXT,
  failure_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_renewal_commands_state_check CHECK (
    state IN ('draft', 'approved', 'activated', 'cancelled', 'failed')
  ),
  CONSTRAINT lease_renewal_commands_requested_terms_object_check CHECK (
    jsonb_typeof(requested_terms)='object'
  ),
  CONSTRAINT lease_renewal_commands_commercial_snapshot_object_check CHECK (
    jsonb_typeof(commercial_snapshot)='object'
  ),
  CONSTRAINT lease_renewal_commands_failure_detail_object_check CHECK (
    jsonb_typeof(failure_detail)='object'
  ),
  CONSTRAINT lease_renewal_commands_approval_check CHECK (
    state IN ('draft','cancelled')
    OR (successor_lease_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)
  ),
  CONSTRAINT lease_renewal_commands_financial_check CHECK (
    financial_prepared_at IS NULL OR (
      state IN ('approved','activated')
      AND financial_prepared_by_user_id IS NOT NULL
      AND first_invoice_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_renewal_commands_activation_authorization_check CHECK (
    activation_authorized_at IS NULL OR (
      state IN ('approved','activated')
      AND activation_authorized_by_user_id IS NOT NULL
      AND financial_prepared_at IS NOT NULL
      AND first_invoice_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_renewal_commands_activated_check CHECK (
    state <> 'activated' OR (
      successor_lease_id IS NOT NULL
      AND first_invoice_id IS NOT NULL
      AND financial_prepared_at IS NOT NULL
      AND activation_authorized_at IS NOT NULL
      AND activated_at IS NOT NULL
      AND activated_by_user_id IS NOT NULL
    )
  ),
  CONSTRAINT lease_renewal_commands_cancelled_check CHECK (
    state <> 'cancelled' OR (
      cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL
      AND char_length(trim(COALESCE(cancel_reason,''))) BETWEEN 1 AND 2000
    )
  ),
  CONSTRAINT lease_renewal_commands_failed_check CHECK (
    state <> 'failed' OR failure_code IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_renewal_commands_open_predecessor
  ON lease_renewal_commands(predecessor_lease_id)
  WHERE state IN ('draft','approved');

CREATE INDEX IF NOT EXISTS idx_lease_renewal_commands_due
  ON lease_renewal_commands(property_id,effective_date,created_at)
  WHERE state='approved' AND financial_prepared_at IS NOT NULL AND activation_authorized_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lease_renewal_commands_predecessor
  ON lease_renewal_commands(predecessor_lease_id,created_at DESC);

-- Extend (rather than replace by a new lifecycle table) the existing safe
-- lease-history vocabulary. These rows are metadata/audit evidence only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_history_event_type_check' AND conrelid='lease_history'::regclass
  ) THEN
    ALTER TABLE lease_history DROP CONSTRAINT lease_history_event_type_check;
  END IF;
  ALTER TABLE lease_history
    ADD CONSTRAINT lease_history_event_type_check CHECK (
      event_type IN (
        'created', 'updated', 'invoice_generated', 'deposit_collected',
        'deposit_refunded', 'deposit_deducted', 'closed', 'transferred_out',
        'transferred_in', 'transfer_scheduled', 'transfer_cancelled', 'transfer_failed',
        'renewal_intent', 'renewal_approved', 'renewal_financial_prepared',
        'renewal_activation_authorized', 'renewed_out', 'renewed_in',
        'renewal_cancelled', 'renewal_failed'
      )
    );
END $$;

COMMIT;
