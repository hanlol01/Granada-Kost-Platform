-- KMO-W08C immutable reminder attempt history.
-- An attempt is evidence of an admin action, not a provider delivery receipt.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.properties') IS NULL
     OR to_regclass('public.residents') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.reminder_templates') IS NULL
     OR to_regclass('public.idempotency_commands') IS NULL THEN
    RAISE EXCEPTION 'W08C_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE='undefined_table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reminder_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL,
  outcome_status TEXT NOT NULL,
  invoice_ids UUID[] NOT NULL,
  invoice_count INTEGER NOT NULL,
  total_outstanding_amount NUMERIC(14,2) NOT NULL,
  template_id UUID REFERENCES reminder_templates(id) ON DELETE RESTRICT,
  template_version INTEGER NOT NULL,
  title_snapshot TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  recipient_name_snapshot TEXT NOT NULL,
  room_number_snapshot TEXT NOT NULL,
  outcome_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT reminder_attempts_channel_check CHECK (channel IN ('whatsapp_manual','manual')),
  CONSTRAINT reminder_attempts_status_check CHECK (outcome_status IN ('previewed','external_opened','manual_sent','failed')),
  CONSTRAINT reminder_attempts_invoice_count_check CHECK (invoice_count = cardinality(invoice_ids) AND invoice_count > 0),
  CONSTRAINT reminder_attempts_amount_check CHECK (total_outstanding_amount >= 0),
  CONSTRAINT reminder_attempts_template_version_check CHECK (template_version > 0),
  CONSTRAINT reminder_attempts_snapshot_check CHECK (
    char_length(trim(recipient_name_snapshot)) > 0
    AND char_length(trim(room_number_snapshot)) > 0
    AND char_length(trim(title_snapshot)) > 0
    AND char_length(trim(body_snapshot)) > 0
  ),
  CONSTRAINT reminder_attempts_note_length_check CHECK (outcome_note IS NULL OR char_length(outcome_note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_reminder_attempts_property_created
  ON reminder_attempts(property_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_attempts_property_resident
  ON reminder_attempts(property_id, resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_attempts_active
  ON reminder_attempts(property_id, outcome_status, created_at DESC)
  WHERE archived_at IS NULL;

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

DROP TRIGGER IF EXISTS trg_reminder_attempt_append_only ON reminder_attempts;
CREATE TRIGGER trg_reminder_attempt_append_only
  BEFORE UPDATE OR DELETE ON reminder_attempts
  FOR EACH ROW EXECUTE FUNCTION prevent_reminder_attempt_mutation();

COMMIT;
