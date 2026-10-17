-- Stores a physical checkout date as the operational fact and distinguishes a
-- contract-price correction from cash that can fund a resident refund.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_exit_final_settlements') IS NULL THEN
    RAISE EXCEPTION 'ACTUAL_CHECKOUT_SETTLEMENT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE lease_checkout_commands
  ADD COLUMN IF NOT EXISTS late_checkout_penalty_waiver_reason TEXT;

ALTER TABLE lease_checkout_commands
  DROP CONSTRAINT IF EXISTS lease_checkout_commands_late_penalty_snapshot_check;

ALTER TABLE lease_checkout_commands
  ADD CONSTRAINT lease_checkout_commands_late_penalty_snapshot_check CHECK (
    charge_policy='legacy_short_notice_v1'
    OR (
      planned_lease_end_date IS NOT NULL
      AND late_checkout_grace_days BETWEEN 0 AND 31
      AND late_checkout_penalty_day_cap BETWEEN 1 AND 366
      AND contract_last_occupancy_date=planned_lease_end_date-1
      AND penalty_free_until_date=contract_last_occupancy_date+late_checkout_grace_days
      AND late_checkout_daily_penalty_amount >= 0
      AND COALESCE(late_checkout_overdue_days,0) >= 0
      AND COALESCE(late_checkout_penalty_days,0) BETWEEN 0 AND late_checkout_penalty_day_cap
      AND COALESCE(late_checkout_penalty_amount,0)
        = late_checkout_daily_penalty_amount * COALESCE(late_checkout_penalty_days,0)
    )
  );

ALTER TABLE lease_exit_final_settlements
  ADD COLUMN IF NOT EXISTS contract_correction_credit_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE lease_exit_final_settlements
  ADD CONSTRAINT lease_exit_final_settlements_contract_correction_credit_check CHECK (
    contract_correction_credit_amount >= 0
  );

COMMENT ON COLUMN lease_checkout_commands.late_checkout_penalty_waiver_reason IS
  'Required by the application when an overdue actual checkout has an Rp0 daily penalty.';
COMMENT ON COLUMN lease_exit_final_settlements.contract_correction_credit_amount IS
  'Contract-price reduction from lease data corrections. It is not payment received and cannot fund a refund.';

COMMIT;
