-- KMO-W08D lease-ending reminder attempts.
-- Lease-ending reminders are auditable admin actions and may exist without an
-- invoice. Existing invoice reminder rows keep their original shape.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reminder_attempts') IS NULL
     OR to_regclass('public.leases') IS NULL THEN
    RAISE EXCEPTION 'W08D_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE='undefined_table';
  END IF;
END $$;

ALTER TABLE reminder_attempts
  ADD COLUMN IF NOT EXISTS reminder_kind TEXT NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS lease_id UUID REFERENCES leases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reminder_milestone TEXT;

ALTER TABLE reminder_attempts
  DROP CONSTRAINT IF EXISTS reminder_attempts_invoice_count_check,
  DROP CONSTRAINT IF EXISTS reminder_attempts_kind_check,
  DROP CONSTRAINT IF EXISTS reminder_attempts_shape_check;

ALTER TABLE reminder_attempts
  ADD CONSTRAINT reminder_attempts_kind_check
  CHECK (reminder_kind IN ('invoice','lease_ending'));

ALTER TABLE reminder_attempts
  ADD CONSTRAINT reminder_attempts_shape_check
  CHECK (
    (
      reminder_kind = 'invoice'
      AND lease_id IS NULL
      AND reminder_milestone IS NULL
      AND invoice_count = cardinality(invoice_ids)
      AND invoice_count > 0
    )
    OR (
      reminder_kind = 'lease_ending'
      AND lease_id IS NOT NULL
      AND reminder_milestone IN ('h60','h30','h14')
      AND invoice_count = 0
      AND cardinality(invoice_ids) = 0
    )
  );

CREATE INDEX IF NOT EXISTS idx_reminder_attempts_property_lease_milestone
  ON reminder_attempts(property_id, lease_id, reminder_milestone, created_at DESC, id DESC)
  WHERE reminder_kind = 'lease_ending';

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
