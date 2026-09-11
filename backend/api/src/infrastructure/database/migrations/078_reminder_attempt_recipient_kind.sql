-- Reminder attempts must retain whether the rendered message targeted the
-- resident or their parent/guardian. Existing immutable attempts were sent to
-- the resident and remain truthful through the default value.
BEGIN;

ALTER TABLE reminder_attempts
  ADD COLUMN IF NOT EXISTS recipient_kind TEXT NOT NULL DEFAULT 'resident';

ALTER TABLE reminder_attempts
  DROP CONSTRAINT IF EXISTS reminder_attempts_recipient_kind_check;

ALTER TABLE reminder_attempts
  ADD CONSTRAINT reminder_attempts_recipient_kind_check
  CHECK (recipient_kind IN ('resident','parent'));

CREATE OR REPLACE FUNCTION prevent_reminder_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'REMINDER_ATTEMPT_APPEND_ONLY' USING ERRCODE='check_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.resident_id IS DISTINCT FROM OLD.resident_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.reminder_kind IS DISTINCT FROM OLD.reminder_kind
     OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
     OR NEW.reminder_milestone IS DISTINCT FROM OLD.reminder_milestone
     OR NEW.recipient_kind IS DISTINCT FROM OLD.recipient_kind
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.outcome_status IS DISTINCT FROM OLD.outcome_status
     OR NEW.invoice_ids IS DISTINCT FROM OLD.invoice_ids
     OR NEW.invoice_count IS DISTINCT FROM OLD.invoice_count
     OR NEW.total_outstanding_amount IS DISTINCT FROM OLD.total_outstanding_amount
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.title_snapshot IS DISTINCT FROM OLD.title_snapshot
     OR NEW.body_snapshot IS DISTINCT FROM OLD.body_snapshot
     OR NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot
     OR NEW.room_number_snapshot IS DISTINCT FROM OLD.room_number_snapshot
     OR NEW.outcome_note IS DISTINCT FROM OLD.outcome_note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL) THEN
    RAISE EXCEPTION 'REMINDER_ATTEMPT_APPEND_ONLY' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
