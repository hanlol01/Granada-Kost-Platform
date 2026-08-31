-- M6 immutable official-document authority for lease exit. The stored safe
-- snapshot freezes the data used by the shared backend PDF renderer; document
-- downloads never rebuild historical facts from mutable current-state rows.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lease_checkout_commands') IS NULL
     OR to_regclass('public.lease_exit_final_settlements') IS NULL
     OR to_regclass('public.lease_exit_refunds') IS NULL
     OR to_regclass('public.lease_checkout_evidence') IS NULL
     OR to_regclass('public.payment_receipts') IS NULL THEN
    RAISE EXCEPTION 'M6_LEASE_EXIT_DOCUMENT_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

-- Preserve the contractual end-date that existed when the exit request was
-- recorded. Physical checkout may shorten leases.end_date, but an official
-- document must still show both the planned and actual end dates.
ALTER TABLE lease_checkout_commands
  ADD COLUMN IF NOT EXISTS planned_lease_end_date DATE;

-- Utilities are recorded as privacy-safe structured evidence. Raw photos and
-- uploaded bills remain separate controlled files and are never embedded in the
-- normal official PDF.
ALTER TABLE lease_checkout_evidence
  DROP CONSTRAINT IF EXISTS lease_checkout_evidence_category_check;
ALTER TABLE lease_checkout_evidence
  ADD CONSTRAINT lease_checkout_evidence_category_check CHECK (
    evidence_category IN (
      'keys_access','inventory','parking','inspection','damage','refund',
      'deposit_offset','settlement','utilities'
    )
  );

-- Existing payment receipt rows remain valid legacy records. New receipts store
-- the exact PDF bytes at issuance so later resident/property edits or reversals
-- cannot change an already-issued document.
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS document_content BYTEA,
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
ALTER TABLE payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_document_content_check;
ALTER TABLE payment_receipts
  ADD CONSTRAINT payment_receipts_document_content_check CHECK (
    (document_content IS NULL AND content_sha256 IS NULL)
    OR (
      octet_length(document_content) > 1000
      AND content_sha256 ~ '^[0-9a-f]{64}$'
    )
  );

CREATE TABLE IF NOT EXISTS lease_exit_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  checkout_command_id UUID NOT NULL REFERENCES lease_checkout_commands(id) ON DELETE RESTRICT,
  final_settlement_id UUID NOT NULL REFERENCES lease_exit_final_settlements(id) ON DELETE RESTRICT,
  exit_refund_id UUID REFERENCES lease_exit_refunds(id) ON DELETE RESTRICT,
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
  document_code TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (
    document_kind IN ('checkout_handover','final_settlement','refund_receipt')
  ),
  safe_snapshot JSONB NOT NULL,
  document_content BYTEA NOT NULL,
  content_sha256 TEXT NOT NULL,
  issued_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lease_exit_documents_code_unique UNIQUE (document_code),
  CONSTRAINT lease_exit_documents_checkout_kind_unique UNIQUE (checkout_command_id,document_kind),
  CONSTRAINT lease_exit_documents_snapshot_object_check CHECK (jsonb_typeof(safe_snapshot)='object'),
  CONSTRAINT lease_exit_documents_content_check CHECK (
    octet_length(document_content) > 1000
    AND content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT lease_exit_documents_refund_kind_check CHECK (
    (document_kind='refund_receipt' AND exit_refund_id IS NOT NULL)
    OR (document_kind<>'refund_receipt' AND exit_refund_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lease_exit_documents_resident_issued
  ON lease_exit_documents(resident_id,issued_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_lease_exit_documents_property_lease
  ON lease_exit_documents(property_id,lease_id,issued_at DESC);

CREATE OR REPLACE FUNCTION validate_lease_exit_document_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  command_record RECORD;
  settlement_record RECORD;
  refund_record RECORD;
BEGIN
  SELECT property_id,lease_id,resident_id,id
    INTO command_record
    FROM lease_checkout_commands
   WHERE id=NEW.checkout_command_id;
  SELECT property_id,lease_id,resident_id,checkout_command_id,id
    INTO settlement_record
    FROM lease_exit_final_settlements
   WHERE id=NEW.final_settlement_id;

  IF command_record.id IS NULL OR settlement_record.id IS NULL
     OR command_record.property_id IS DISTINCT FROM NEW.property_id
     OR command_record.lease_id IS DISTINCT FROM NEW.lease_id
     OR command_record.resident_id IS DISTINCT FROM NEW.resident_id
     OR settlement_record.property_id IS DISTINCT FROM NEW.property_id
     OR settlement_record.lease_id IS DISTINCT FROM NEW.lease_id
     OR settlement_record.resident_id IS DISTINCT FROM NEW.resident_id
     OR settlement_record.checkout_command_id IS DISTINCT FROM NEW.checkout_command_id THEN
    RAISE EXCEPTION 'LEASE_EXIT_DOCUMENT_SCOPE_INVALID'
      USING ERRCODE='check_violation';
  END IF;

  IF NEW.exit_refund_id IS NOT NULL THEN
    SELECT property_id,lease_id,checkout_command_id,final_settlement_id,id
      INTO refund_record
      FROM lease_exit_refunds
     WHERE id=NEW.exit_refund_id;
    IF refund_record.id IS NULL
       OR refund_record.property_id IS DISTINCT FROM NEW.property_id
       OR refund_record.lease_id IS DISTINCT FROM NEW.lease_id
       OR refund_record.checkout_command_id IS DISTINCT FROM NEW.checkout_command_id
       OR refund_record.final_settlement_id IS DISTINCT FROM NEW.final_settlement_id THEN
      RAISE EXCEPTION 'LEASE_EXIT_REFUND_DOCUMENT_SCOPE_INVALID'
        USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_lease_exit_document_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEASE_EXIT_DOCUMENT_HISTORY_IMMUTABLE'
    USING ERRCODE='check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_lease_exit_documents_scope ON lease_exit_documents;
CREATE TRIGGER trg_lease_exit_documents_scope
  BEFORE INSERT ON lease_exit_documents
  FOR EACH ROW EXECUTE FUNCTION validate_lease_exit_document_scope();

DROP TRIGGER IF EXISTS trg_lease_exit_documents_immutable ON lease_exit_documents;
CREATE TRIGGER trg_lease_exit_documents_immutable
  BEFORE UPDATE OR DELETE ON lease_exit_documents
  FOR EACH ROW EXECUTE FUNCTION protect_lease_exit_document_history();

COMMIT;
