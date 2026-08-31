-- M5 lease-exit request and approval authority. This extends the existing
-- checkout case without reinterpreting or backfilling historical checkout rows.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_history') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.business_events') IS NULL THEN
    RAISE EXCEPTION 'M5_LEASE_EXIT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE lease_checkout_commands
  ADD COLUMN IF NOT EXISTS exit_type TEXT,
  ADD COLUMN IF NOT EXISTS request_source TEXT,
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notice_days INTEGER,
  ADD COLUMN IF NOT EXISTS missing_notice_days INTEGER,
  ADD COLUMN IF NOT EXISTS payment_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS daily_rate_amount BIGINT,
  ADD COLUMN IF NOT EXISTS recommended_short_notice_charge BIGINT,
  ADD COLUMN IF NOT EXISTS approved_short_notice_charge BIGINT,
  ADD COLUMN IF NOT EXISTS short_notice_waiver_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS physical_checkout_confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_checkout_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_checkout_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_checkout_commands_m5_exit_quote_check'
      AND conrelid='lease_checkout_commands'::regclass
  ) THEN
    ALTER TABLE lease_checkout_commands
      ADD CONSTRAINT lease_checkout_commands_m5_exit_quote_check CHECK (
        exit_type IS NULL OR (
          exit_type IN ('resident_early_termination','normal_expiry')
          AND request_source IN ('admin_recorded_resident_request','admin_recorded_normal_expiry')
          AND requested_by_user_id IS NOT NULL
          AND notice_days >= 0
          AND missing_notice_days BETWEEN 0 AND 14
          AND payment_period_days BETWEEN 28 AND 31
          AND daily_rate_amount > 0
          AND recommended_short_notice_charge >= 0
          AND (
            exit_type <> 'normal_expiry'
            OR (missing_notice_days=0 AND recommended_short_notice_charge=0)
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_checkout_commands_m5_approval_check'
      AND conrelid='lease_checkout_commands'::regclass
  ) THEN
    ALTER TABLE lease_checkout_commands
      ADD CONSTRAINT lease_checkout_commands_m5_approval_check CHECK (
        exit_type IS NULL
        OR approved_at IS NULL
        OR (
          approved_by_user_id IS NOT NULL
          AND approved_short_notice_charge IS NOT NULL
          AND approved_short_notice_charge BETWEEN 0 AND recommended_short_notice_charge
          AND (
            approved_short_notice_charge = recommended_short_notice_charge
            OR char_length(trim(COALESCE(short_notice_waiver_reason,''))) BETWEEN 3 AND 2000
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='lease_checkout_commands_m5_physical_checkout_check'
      AND conrelid='lease_checkout_commands'::regclass
  ) THEN
    ALTER TABLE lease_checkout_commands
      ADD CONSTRAINT lease_checkout_commands_m5_physical_checkout_check CHECK (
        exit_type IS NULL
        OR state NOT IN ('inspection_required','settlement_pending','completed')
        OR (
          physical_checkout_confirmed_by_user_id IS NOT NULL
          AND physical_checkout_confirmed_at IS NOT NULL
          AND actual_checkout_date IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lease_checkout_commands_m5_exit_state
  ON lease_checkout_commands(property_id,exit_type,state,effective_date)
  WHERE exit_type IS NOT NULL;

COMMENT ON COLUMN lease_checkout_commands.exit_type IS
  'M5 versioned exit path; NULL preserves checkout rows created before migration 052.';
COMMENT ON COLUMN lease_checkout_commands.recommended_short_notice_charge IS
  'Server-calculated recommendation; an Admin may only reduce it with an audited waiver reason.';

COMMIT;
