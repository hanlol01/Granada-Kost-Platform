-- The actual checkout date is an operational fact recorded before the
-- handover workflow. Keep its immutable history event in the canonical lease
-- history vocabulary so a valid historical checkout does not fail at runtime.
BEGIN;

ALTER TABLE lease_history
  DROP CONSTRAINT IF EXISTS lease_history_event_type_check;

ALTER TABLE lease_history
  ADD CONSTRAINT lease_history_event_type_check CHECK (event_type IN (
    'created','updated','invoice_generated','deposit_collected','deposit_refunded','deposit_deducted','closed',
    'transferred_out','transferred_in','transfer_scheduled','transfer_cancelled','transfer_failed',
    'renewal_intent','renewal_approved','renewal_financial_prepared','renewal_activation_authorized','renewed_out','renewed_in','renewal_cancelled','renewal_failed',
    'checkout_notice_received','checkout_scheduled','checkout_handover_recorded','checkout_inspection_recorded','checkout_completed','checkout_cancelled',
    'checkout_notice_edited','checkout_approval_edited','checkout_revision_requested','checkout_actual_recorded',
    'activated','activation_attention_required','check_in_confirmation_required','check_in_confirmed','lease_data_corrected',
    'archive_restored','archive_replaced','archive_successor_created'
  ));

COMMIT;
