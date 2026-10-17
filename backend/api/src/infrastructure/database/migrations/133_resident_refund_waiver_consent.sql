BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_exit_final_settlements') IS NULL THEN
    RAISE EXCEPTION 'lease_exit_final_settlements must exist before resident refund-waiver consent can be added';
  END IF;
END $$;

ALTER TABLE lease_exit_final_settlements
  ADD COLUMN IF NOT EXISTS refund_waived_by_resident BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lease_exit_final_settlements
  DROP CONSTRAINT IF EXISTS lease_exit_final_settlements_adjustment_reason_check;

ALTER TABLE lease_exit_final_settlements
  ADD CONSTRAINT lease_exit_final_settlements_adjustment_reason_check CHECK (
    final_refund_amount = recommended_refund_amount
    OR (
      recommended_refund_amount > 0
      AND final_refund_amount = 0
      AND refund_waived_by_resident = TRUE
    )
    OR (
      char_length(trim(COALESCE(refund_adjustment_reason, ''))) BETWEEN 3 AND 2000
      AND refund_adjustment_evidence_file_id IS NOT NULL
    )
  );

COMMENT ON COLUMN lease_exit_final_settlements.refund_waived_by_resident IS
  'True only when an Admin records the resident explicit consent to close a positive recommended refund at Rp0.';

COMMIT;
