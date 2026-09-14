-- Extend the lease history vocabulary for checkout edits and formal revision
-- requests. This migration changes validation metadata only; it does not rewrite
-- lease, checkout, resident, room, occupancy, or billing data.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_history') IS NULL THEN
    RAISE EXCEPTION 'LEASE_CHECKOUT_REVISION_HISTORY_PREREQUISITE_MISSING'
      USING ERRCODE = 'undefined_table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
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
        'checkout_notice_edited','checkout_approval_edited','checkout_revision_requested',
        'activated','activation_attention_required','check_in_confirmation_required','check_in_confirmed'
      )
    );
END;
$$;

COMMIT;
