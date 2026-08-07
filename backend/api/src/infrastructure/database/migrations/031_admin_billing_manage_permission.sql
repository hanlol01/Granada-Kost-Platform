-- Permit the daily Admin role to record contract-rent payments from Resident Detail.
-- This is additive and preserves every existing role grant.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.roles') IS NULL
    OR to_regclass('public.permissions') IS NULL
    OR to_regclass('public.role_permissions') IS NULL THEN
    RAISE EXCEPTION 'W07B_RBAC_SCHEMA_MISSING' USING ERRCODE = 'undefined_table';
  END IF;
END $$;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'billing.manage'
WHERE roles.code = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
