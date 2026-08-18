-- KMO-W08A reminder template and composer authority. This migration never
-- enables an external delivery provider and never stores an opaque share token.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.properties') IS NULL
     OR to_regclass('public.invoices') IS NULL
     OR to_regclass('public.users') IS NULL
     OR to_regclass('public.residents') IS NULL THEN
    RAISE EXCEPTION 'W08A_PREREQUISITE_SCHEMA_MISSING' USING ERRCODE='undefined_table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  template_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  protected_variables TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT reminder_templates_key_check CHECK (template_key IN ('invoice_reminder')),
  CONSTRAINT reminder_templates_version_check CHECK (version > 0),
  CONSTRAINT reminder_templates_status_check CHECK (status IN ('active','archived')),
  CONSTRAINT reminder_templates_content_check CHECK (
    char_length(trim(title_template)) BETWEEN 1 AND 500
    AND char_length(trim(body_template)) BETWEEN 1 AND 8000
  ),
  CONSTRAINT reminder_templates_protected_variables_check CHECK (
    cardinality(protected_variables) > 0
  ),
  CONSTRAINT reminder_templates_version_unique UNIQUE(property_id, template_key, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_templates_active_key
  ON reminder_templates(property_id, template_key)
  WHERE status='active';

-- Token values are generated once in application memory and only their SHA-256
-- hashes survive persistence. A replacement can revoke a prior link without
-- changing its reminder template or invoice authority.
CREATE TABLE IF NOT EXISTS reminder_invoice_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reminder_invoice_share_links_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_reminder_invoice_share_links_invoice_active
  ON reminder_invoice_share_links(invoice_id, expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
