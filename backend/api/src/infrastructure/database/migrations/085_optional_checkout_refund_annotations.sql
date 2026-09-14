-- Keep refund payout evidence mandatory while allowing operational reference
-- and waiver notes to be omitted when they are not available.
BEGIN;

ALTER TABLE lease_exit_refunds
  DROP CONSTRAINT IF EXISTS lease_exit_refunds_completion_check;

ALTER TABLE lease_exit_refunds
  ADD CONSTRAINT lease_exit_refunds_completion_check CHECK (
    refund_status='pending'
    OR (
      settled_by_user_id IS NOT NULL
      AND settled_at IS NOT NULL
      AND (
        (
          refund_status='settled'
          AND payment_method IN ('cash','bank_transfer','qris','ewallet','other')
          AND evidence_file_id IS NOT NULL
        )
        OR refund_status='waived'
        OR refund_status='reversed'
      )
    )
  );

ALTER TABLE lease_refund_settlements
  DROP CONSTRAINT IF EXISTS lease_refund_settlements_reason_check;

COMMIT;
