INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'report.export'
WHERE roles.code IN ('owner', 'manager', 'admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;
