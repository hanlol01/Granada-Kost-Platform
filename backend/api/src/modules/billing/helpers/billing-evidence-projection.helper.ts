export type BillingEvidenceRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: string | number;
  content_path: string | null;
  availability?: 'available' | 'purged' | 'purge_pending' | 'unavailable';
  purged_at?: string | null;
};

// All Admin billing reads use the same file alias and scoped, durable purge fact.
// Retain attachment metadata; never turn metadata hiding into verified absence.
export const BILLING_EVIDENCE_JSON_SQL = `jsonb_build_object(
  'id',file.id,'original_filename',file.original_filename,'mime_type',file.mime_type,
  'file_size_bytes',file.file_size_bytes,
  'content_path',CASE WHEN NOT file.is_deleted AND file.archive_purge_command_id IS NULL
    AND COALESCE(file.metadata->>'storage_content_unavailable','false') <> 'true'
    THEN '/files/'||file.id||'/content' ELSE NULL END
) || CASE WHEN file.archive_purge_command_id IS NOT NULL THEN COALESCE((
  SELECT jsonb_build_object(
    'availability',CASE WHEN item.status='deleted' AND file.is_deleted THEN 'purged' ELSE 'purge_pending' END,
    'purged_at',CASE WHEN item.status='deleted' AND file.is_deleted THEN item.verified_deleted_at ELSE NULL END
  ) FROM lease_file_purge_items item
  WHERE item.file_id=file.id AND item.property_id=file.property_id
    AND item.command_id=file.archive_purge_command_id
),jsonb_build_object('availability','purge_pending','purged_at',NULL))
ELSE jsonb_build_object('availability',CASE WHEN file.is_deleted
  OR file.metadata->>'storage_content_unavailable'='true' THEN 'unavailable' ELSE 'available' END,
  'purged_at',NULL) END`;
