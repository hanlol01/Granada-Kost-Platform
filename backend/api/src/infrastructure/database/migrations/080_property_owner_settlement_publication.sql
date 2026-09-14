BEGIN;

ALTER TABLE property_owner_settlements
  ADD COLUMN IF NOT EXISTS source_checksum TEXT,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_for_review_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_source_checksum TEXT;

CREATE TABLE IF NOT EXISTS property_owner_settlement_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  owner_profile_id UUID NOT NULL REFERENCES property_owner_profiles(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES property_owner_settlements(id) ON DELETE RESTRICT,
  document_number TEXT NOT NULL,
  document_version INTEGER NOT NULL DEFAULT 1,
  publication_status TEXT NOT NULL DEFAULT 'published',
  snapshot JSONB NOT NULL,
  source_checksum TEXT NOT NULL,
  supersedes_publication_id UUID REFERENCES property_owner_settlement_publications(id) ON DELETE RESTRICT,
  published_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_owner_settlement_publications_version_check CHECK (document_version > 0),
  CONSTRAINT property_owner_settlement_publications_status_check CHECK (
    publication_status IN ('published', 'superseded')
  ),
  CONSTRAINT property_owner_settlement_publications_document_check CHECK (
    length(btrim(document_number)) BETWEEN 8 AND 100
  ),
  CONSTRAINT property_owner_settlement_publications_checksum_check CHECK (
    source_checksum ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT property_owner_settlement_publications_snapshot_check CHECK (
    jsonb_typeof(snapshot) = 'object'
  ),
  UNIQUE (settlement_id, document_version),
  UNIQUE (document_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owner_settlement_publications_current
  ON property_owner_settlement_publications(settlement_id)
  WHERE publication_status = 'published';

CREATE INDEX IF NOT EXISTS idx_property_owner_settlement_publications_owner_period
  ON property_owner_settlement_publications(owner_profile_id, published_at DESC);

CREATE OR REPLACE FUNCTION validate_property_owner_settlement_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  settlement_scope RECORD;
BEGIN
  SELECT property_id, owner_profile_id, settlement_status
    INTO settlement_scope
  FROM property_owner_settlements
  WHERE id = NEW.settlement_id
  FOR KEY SHARE;

  IF settlement_scope.property_id IS NULL
     OR settlement_scope.property_id <> NEW.property_id
     OR settlement_scope.owner_profile_id <> NEW.owner_profile_id
     OR settlement_scope.settlement_status NOT IN ('approved', 'paid') THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_PUBLICATION_SCOPE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.document_version = 1 AND NEW.supersedes_publication_id IS NOT NULL THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_PUBLICATION_VERSION_INVALID'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_property_owner_settlement_publication
  ON property_owner_settlement_publications;
CREATE TRIGGER trg_validate_property_owner_settlement_publication
  BEFORE INSERT ON property_owner_settlement_publications
  FOR EACH ROW EXECUTE FUNCTION validate_property_owner_settlement_publication();

CREATE OR REPLACE FUNCTION prevent_property_owner_settlement_publication_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PROPERTY_OWNER_SETTLEMENT_PUBLICATION_APPEND_ONLY'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_property_owner_settlement_publications_append_only
  ON property_owner_settlement_publications;
CREATE TRIGGER trg_property_owner_settlement_publications_append_only
  BEFORE UPDATE OR DELETE ON property_owner_settlement_publications
  FOR EACH ROW EXECUTE FUNCTION prevent_property_owner_settlement_publication_mutation();

ALTER TABLE property_owner_payouts
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION validate_property_owner_payout_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  settlement_scope RECORD;
  original_payout RECORD;
  destination_scope RECORD;
  payable_remainder INTEGER;
BEGIN
  SELECT property_id, owner_profile_id, settlement_status, owner_amount
    INTO settlement_scope
  FROM property_owner_settlements
  WHERE id = NEW.settlement_id
  FOR UPDATE;

  IF settlement_scope.property_id IS NULL
     OR settlement_scope.property_id <> NEW.property_id
     OR settlement_scope.owner_profile_id <> NEW.owner_profile_id
     OR settlement_scope.settlement_status NOT IN ('approved', 'paid')
     OR NOT EXISTS (
       SELECT 1 FROM property_owner_settlement_publications publications
       WHERE publications.settlement_id = NEW.settlement_id
         AND publications.publication_status = 'published'
     ) THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_SETTLEMENT_UNAVAILABLE' USING ERRCODE = '23514';
  END IF;

  SELECT property_id, owner_profile_id
    INTO destination_scope
  FROM property_owner_payout_destination_snapshots
  WHERE id = NEW.payout_destination_snapshot_id
  FOR KEY SHARE;

  IF destination_scope.property_id IS NULL
     OR destination_scope.property_id <> NEW.property_id
     OR destination_scope.owner_profile_id <> NEW.owner_profile_id THEN
    RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_DESTINATION_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.payout_kind = 'reversal' THEN
    SELECT property_id, owner_profile_id, settlement_id, payout_kind, payout_amount
      INTO original_payout
    FROM property_owner_payouts
    WHERE id = NEW.reversal_of_payout_id;
    IF original_payout.property_id IS NULL
       OR original_payout.property_id <> NEW.property_id
       OR original_payout.owner_profile_id <> NEW.owner_profile_id
       OR original_payout.settlement_id <> NEW.settlement_id
       OR original_payout.payout_kind <> 'payout'
       OR original_payout.payout_amount <> NEW.payout_amount THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_REVERSAL_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF settlement_scope.settlement_status <> 'approved' THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_SETTLEMENT_ALREADY_PAID' USING ERRCODE = '23514';
    END IF;
    SELECT settlement_scope.owner_amount - COALESCE(SUM(
      CASE WHEN payout_kind = 'payout' THEN payout_amount ELSE -payout_amount END
    ), 0)::integer
      INTO payable_remainder
    FROM property_owner_payouts
    WHERE settlement_id = NEW.settlement_id;
    IF NEW.payout_amount > payable_remainder THEN
      RAISE EXCEPTION 'PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
