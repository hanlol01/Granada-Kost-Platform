-- Administrative mode amendments preserve original billing/policy and onboarding inputs.
BEGIN;

CREATE TABLE IF NOT EXISTS lease_commercial_mode_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL,
  correction_id UUID NOT NULL UNIQUE,
  from_mode TEXT NOT NULL CHECK (from_mode IN ('rent','owner_sponsored')),
  to_mode TEXT NOT NULL CHECK (to_mode IN ('rent','owner_sponsored') AND to_mode<>from_mode),
  effective_from DATE NOT NULL,
  previous_state JSONB NOT NULL CHECK (jsonb_typeof(previous_state)='object'),
  corrected_state JSONB NOT NULL CHECK (jsonb_typeof(corrected_state)='object'),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_commercial_mode_revision_correction_fk FOREIGN KEY(correction_id,property_id,lease_id)
    REFERENCES lease_data_corrections(id,property_id,lease_id) ON DELETE RESTRICT,
  CONSTRAINT lease_commercial_mode_revision_states_check CHECK (
    previous_state->>'commercialMode'=from_mode AND corrected_state->>'commercialMode'=to_mode
    AND effective_from=(corrected_state->>'startDate')::date
    AND previous_state ? 'commercialMode' AND corrected_state ?& ARRAY['commercialMode','startDate','commercialTransition']
  )
);
CREATE INDEX IF NOT EXISTS idx_lease_commercial_mode_revision_timeline
  ON lease_commercial_mode_revisions(property_id,lease_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION validate_lease_commercial_mode_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amendment RECORD; source_lease RECORD;
BEGIN
  SELECT previous_snapshot,corrected_snapshot,created_by_user_id INTO amendment
    FROM lease_data_corrections WHERE id=NEW.correction_id AND property_id=NEW.property_id AND lease_id=NEW.lease_id;
  SELECT commercial_mode,lease_status INTO source_lease FROM leases WHERE id=NEW.lease_id AND property_id=NEW.property_id FOR UPDATE;
  IF source_lease.commercial_mode IS DISTINCT FROM NEW.from_mode OR source_lease.lease_status NOT IN ('awaiting_activation','active')
    OR amendment.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
    OR amendment.previous_snapshot IS DISTINCT FROM NEW.previous_state
    OR amendment.corrected_snapshot IS DISTINCT FROM NEW.corrected_state THEN
    RAISE EXCEPTION 'LEASE_COMMERCIAL_REVISION_SOURCE_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_lease_commercial_mode_revision_validate ON lease_commercial_mode_revisions;
CREATE TRIGGER trg_lease_commercial_mode_revision_validate BEFORE INSERT ON lease_commercial_mode_revisions
  FOR EACH ROW EXECUTE FUNCTION validate_lease_commercial_mode_revision();
DROP TRIGGER IF EXISTS trg_lease_commercial_mode_revision_immutable ON lease_commercial_mode_revisions;
CREATE TRIGGER trg_lease_commercial_mode_revision_immutable BEFORE UPDATE OR DELETE ON lease_commercial_mode_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_lease_data_correction_mutation();

-- Keep prior installments, but allow a replacement period only after its old
-- installment was voided by the canonical invoice authority. Sequence numbers
-- remain unique and grow monotonically across schedule generations.
ALTER TABLE lease_installments DROP CONSTRAINT IF EXISTS lease_installments_period_unique;
CREATE UNIQUE INDEX IF NOT EXISTS lease_installments_current_period_unique
  ON lease_installments(lease_id,coverage_start_date) WHERE installment_status<>'void';

-- Migration 017's all-history cycle key prevents a replacement invoice even
-- after W06 has voided its predecessor. Keep the old invoice and code intact,
-- while allowing only one non-void invoice per lease/cycle.
DROP INDEX IF EXISTS idx_invoices_lease_cycle_start_unique;
CREATE UNIQUE INDEX idx_invoices_lease_cycle_start_unique
  ON invoices(lease_id,cycle_start_date)
  WHERE lease_id IS NOT NULL AND invoice_status<>'void';

COMMIT;
