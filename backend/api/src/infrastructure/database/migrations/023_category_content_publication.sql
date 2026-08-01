-- KMO-W02C-D category content and publication authority.
-- Forward-only, additive, and safe for the ledger-aware migration runner.

BEGIN;

-- Migration 016 created the legacy policy table without an archive marker.
-- Add it here before publication queries reference rule.deleted_at so an
-- existing pre-ledger database can migrate without an out-of-band patch.
ALTER TABLE kost_type_rules
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS kost_type_content_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  normalized_label VARCHAR(120) NOT NULL,
  public_description VARCHAR(500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_state VARCHAR(20) NOT NULL DEFAULT 'active',
  public_visible BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT kost_type_content_facilities_state_check
    CHECK (content_state IN ('active', 'archived')),
  CONSTRAINT kost_type_content_facilities_label_check
    CHECK (length(btrim(label)) > 0 AND normalized_label = lower(btrim(label))),
  CONSTRAINT kost_type_content_facilities_order_check CHECK (sort_order >= 0),
  CONSTRAINT kost_type_content_facilities_lifecycle_check CHECK (
    (content_state = 'active' AND archived_at IS NULL)
    OR
    (content_state = 'archived' AND archived_at IS NOT NULL AND public_visible = false)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kost_type_content_facility_label
  ON kost_type_content_facilities(kost_type_id, normalized_label)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kost_type_content_facility_order
  ON kost_type_content_facilities(kost_type_id, sort_order)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kost_type_content_facilities_scope
  ON kost_type_content_facilities(property_id, kost_type_id, content_state, sort_order);

ALTER TABLE hunian_gallery_images
  ADD COLUMN IF NOT EXISTS public_derivative_file_id UUID
    REFERENCES files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_state VARCHAR(20) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hunian_gallery_images_content_state_check'
  ) THEN
    ALTER TABLE hunian_gallery_images
      ADD CONSTRAINT hunian_gallery_images_content_state_check
      CHECK (content_state IN ('draft', 'archived'));
  END IF;
END $$;

UPDATE hunian_gallery_images
SET content_state = 'archived',
    archived_at = COALESCE(archived_at, now()),
    is_cover = false,
    public_visible = false
WHERE target_type = 'common_area'
  AND deleted_at IS NULL
  AND content_state <> 'archived';

DROP INDEX IF EXISTS idx_hunian_gallery_v2_kost_type_cover;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hunian_gallery_category_draft_order
  ON hunian_gallery_images(property_id, kost_type_id, sort_order)
  WHERE deleted_at IS NULL
    AND target_type = 'kost_type'
    AND content_state = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hunian_gallery_category_draft_cover
  ON hunian_gallery_images(property_id, kost_type_id)
  WHERE deleted_at IS NULL
    AND target_type = 'kost_type'
    AND content_state = 'draft'
    AND is_cover = true;

CREATE INDEX IF NOT EXISTS idx_hunian_gallery_category_draft
  ON hunian_gallery_images(property_id, kost_type_id, content_state, sort_order)
  WHERE deleted_at IS NULL AND target_type = 'kost_type';

CREATE TABLE IF NOT EXISTS kost_type_content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kost_type_id UUID NOT NULL REFERENCES kost_types(id) ON DELETE CASCADE,
  content_type VARCHAR(20) NOT NULL,
  version INTEGER NOT NULL,
  publication_status VARCHAR(20) NOT NULL DEFAULT 'published',
  effective_date DATE NOT NULL,
  payload JSONB NOT NULL,
  restored_from_version_id UUID REFERENCES kost_type_content_versions(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kost_type_content_versions_type_check
    CHECK (content_type IN ('facilities', 'gallery')),
  CONSTRAINT kost_type_content_versions_status_check
    CHECK (publication_status IN ('published', 'archived')),
  CONSTRAINT kost_type_content_versions_version_check CHECK (version > 0),
  CONSTRAINT kost_type_content_versions_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT kost_type_content_versions_unique_version
    UNIQUE (kost_type_id, content_type, version),
  CONSTRAINT kost_type_content_versions_unique_effective
    UNIQUE (kost_type_id, content_type, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_kost_type_content_versions_effective
  ON kost_type_content_versions(property_id, kost_type_id, content_type, effective_date DESC)
  WHERE publication_status = 'published';

CREATE TABLE IF NOT EXISTS property_policy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL DEFAULT 'public_terms',
  version INTEGER NOT NULL,
  publication_status VARCHAR(20) NOT NULL,
  effective_date DATE,
  internal_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  restored_from_version_id UUID REFERENCES property_policy_documents(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  published_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT property_policy_documents_type_check
    CHECK (document_type = 'public_terms'),
  CONSTRAINT property_policy_documents_status_check
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  CONSTRAINT property_policy_documents_version_check CHECK (version > 0),
  CONSTRAINT property_policy_documents_content_check
    CHECK (jsonb_typeof(internal_content) = 'object' AND jsonb_typeof(public_content) = 'object'),
  CONSTRAINT property_policy_documents_publish_check CHECK (
    (publication_status = 'published' AND effective_date IS NOT NULL
      AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
    OR publication_status <> 'published'
  ),
  CONSTRAINT property_policy_documents_unique_version
    UNIQUE (property_id, document_type, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_policy_documents_draft
  ON property_policy_documents(property_id, document_type)
  WHERE publication_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_policy_documents_effective
  ON property_policy_documents(property_id, document_type, effective_date)
  WHERE effective_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_property_policy_documents_effective
  ON property_policy_documents(property_id, document_type, effective_date DESC)
  WHERE publication_status = 'published';

CREATE OR REPLACE FUNCTION prevent_kost_type_content_version_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'KOST_TYPE_CONTENT_VERSION_IMMUTABLE'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD.property_id IS DISTINCT FROM NEW.property_id
    OR OLD.kost_type_id IS DISTINCT FROM NEW.kost_type_id
    OR OLD.content_type IS DISTINCT FROM NEW.content_type
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.effective_date IS DISTINCT FROM NEW.effective_date
    OR OLD.payload IS DISTINCT FROM NEW.payload
    OR OLD.restored_from_version_id IS DISTINCT FROM NEW.restored_from_version_id
    OR OLD.published_at IS DISTINCT FROM NEW.published_at
    OR OLD.published_by_user_id IS DISTINCT FROM NEW.published_by_user_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR (OLD.publication_status = 'archived' AND NEW.publication_status <> 'archived')
    OR (
      OLD.publication_status = 'published'
      AND NEW.publication_status NOT IN ('published', 'archived')
    )
    OR (
      OLD.publication_status = 'archived'
      AND OLD.archived_at IS DISTINCT FROM NEW.archived_at
    )
  THEN
    RAISE EXCEPTION 'KOST_TYPE_CONTENT_VERSION_IMMUTABLE'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kost_type_content_version_immutable
  ON kost_type_content_versions;
CREATE TRIGGER trg_kost_type_content_version_immutable
BEFORE UPDATE OR DELETE ON kost_type_content_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_kost_type_content_version_rewrite();

CREATE OR REPLACE FUNCTION prevent_published_policy_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.publication_status <> 'draft' THEN
    RAISE EXCEPTION 'PUBLISHED_POLICY_VERSION_IMMUTABLE'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF OLD.publication_status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.property_id IS DISTINCT FROM NEW.property_id
    OR OLD.document_type IS DISTINCT FROM NEW.document_type
    OR OLD.version IS DISTINCT FROM NEW.version
    OR OLD.effective_date IS DISTINCT FROM NEW.effective_date
    OR OLD.internal_content IS DISTINCT FROM NEW.internal_content
    OR OLD.public_content IS DISTINCT FROM NEW.public_content
    OR OLD.restored_from_version_id IS DISTINCT FROM NEW.restored_from_version_id
    OR OLD.published_at IS DISTINCT FROM NEW.published_at
    OR OLD.published_by_user_id IS DISTINCT FROM NEW.published_by_user_id
    OR OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR (OLD.publication_status = 'archived' AND NEW.publication_status <> 'archived')
    OR (
      OLD.publication_status = 'published'
      AND NEW.publication_status NOT IN ('published', 'archived')
    )
    OR (
      OLD.publication_status = 'archived'
      AND OLD.archived_at IS DISTINCT FROM NEW.archived_at
    )
  THEN
    RAISE EXCEPTION 'PUBLISHED_POLICY_VERSION_IMMUTABLE'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_published_policy_immutable
  ON property_policy_documents;
CREATE TRIGGER trg_published_policy_immutable
BEFORE UPDATE OR DELETE ON property_policy_documents
FOR EACH ROW
EXECUTE FUNCTION prevent_published_policy_rewrite();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM kost_type_facility_assignments assignment
    JOIN room_facilities facility ON facility.id = assignment.facility_id
    JOIN kost_types kost_type ON kost_type.id = assignment.kost_type_id
    WHERE kost_type.deleted_at IS NULL
    GROUP BY assignment.kost_type_id, lower(btrim(facility.name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'W02CD_LEGACY_FACILITY_LABEL_AMBIGUOUS'
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

INSERT INTO kost_type_content_facilities (
  property_id,
  kost_type_id,
  label,
  normalized_label,
  public_description,
  sort_order,
  content_state,
  public_visible,
  created_by_user_id,
  updated_by_user_id,
  archived_at
)
SELECT
  kost_type.property_id,
  assignment.kost_type_id,
  facility.name,
  lower(btrim(facility.name)),
  facility.description,
  (
    row_number() OVER (
    PARTITION BY assignment.kost_type_id
    ORDER BY facility.sort_order, facility.name, facility.id
    ) - 1
  )::int,
  CASE WHEN facility.status = 'active' THEN 'active' ELSE 'archived' END,
  facility.status = 'active',
  facility.created_by_user_id,
  facility.updated_by_user_id,
  CASE WHEN facility.status = 'active' THEN NULL ELSE now() END
FROM kost_type_facility_assignments assignment
JOIN kost_types kost_type ON kost_type.id = assignment.kost_type_id
JOIN room_facilities facility ON facility.id = assignment.facility_id
WHERE kost_type.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO property_policy_documents (
  property_id,
  document_type,
  version,
  publication_status,
  internal_content,
  public_content
)
SELECT
  property.id,
  'public_terms',
  1,
  'draft',
  jsonb_build_object(
    'operating_policy',
    COALESCE(
      (
        SELECT string_agg(rule.rule_text, E'\n' ORDER BY rule.sort_order, rule.id)
        FROM kost_type_rules rule
        WHERE rule.property_id = property.id
          AND rule.deleted_at IS NULL
      ),
      ''
    )
  ),
  jsonb_build_object(
    'pricing_explanation', '',
    'minimum_lease_term', '',
    'dp_explanation', '',
    'security_deposit_explanation', '',
    'manual_payment_methods', '[]'::jsonb,
    'house_rules', '[]'::jsonb,
    'visitor_hours', '21:00',
    'contact_information', '',
    'category_applicability', jsonb_build_array('rukost', 'apartkost')
  )
FROM properties property
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM kost_type_content_facilities facility
    JOIN kost_types kost_type ON kost_type.id = facility.kost_type_id
    WHERE facility.property_id <> kost_type.property_id
  ) THEN
    RAISE EXCEPTION 'W02CD_FACILITY_PROPERTY_MISMATCH'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM kost_type_content_facilities facility
    WHERE facility.archived_at IS NULL
    GROUP BY facility.kost_type_id, facility.normalized_label
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'W02CD_DUPLICATE_FACILITY_LABEL'
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

COMMIT;
