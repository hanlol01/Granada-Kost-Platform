-- KMO-W02: Archived category-content history must not block a replacement publication.
BEGIN;

ALTER TABLE kost_type_content_versions
  DROP CONSTRAINT IF EXISTS kost_type_content_versions_unique_effective;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kost_type_content_versions_published_effective
  ON kost_type_content_versions(kost_type_id, content_type, effective_date)
  WHERE publication_status = 'published';

COMMIT;
