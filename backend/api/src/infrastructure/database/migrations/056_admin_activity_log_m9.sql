-- M9 read-only Admin Activity Log authority. The page consumes the existing
-- append-only audit ledger; this migration adds explicit RBAC and query indexes
-- without copying or rewriting historical audit payloads.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.roles') IS NULL
     OR to_regclass('public.permissions') IS NULL
     OR to_regclass('public.role_permissions') IS NULL THEN
    RAISE EXCEPTION 'M9_ADMIN_ACTIVITY_LOG_PREREQUISITE_SCHEMA_MISSING'
      USING ERRCODE='undefined_table';
  END IF;
END $$;

INSERT INTO permissions(code,name,description)
VALUES(
  'activity_log.read',
  'Read Admin Activity Log',
  'Read property-scoped and privacy-redacted operational activity history.'
)
ON CONFLICT(code) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description;

INSERT INTO role_permissions(role_id,permission_id)
SELECT role.id,permission.id
  FROM roles role
  JOIN permissions permission ON permission.code='activity_log.read'
 WHERE role.code='admin'
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_audit_logs_property_action_time
  ON audit_logs(property_id,action,occurred_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_property_actor_time
  ON audit_logs(property_id,actor_user_id,occurred_at DESC,id DESC);

COMMIT;
