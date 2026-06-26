WITH role_seed(code, name, description) AS (
  VALUES
    ('owner', 'Owner', 'Platform/operator owner with highest access.'),
    ('manager', 'Manager', 'Operational manager with broad property operations.'),
    ('admin', 'Admin', 'Daily administrative staff.'),
    ('technician', 'Technician', 'Maintenance staff assigned to work orders.'),
    ('resident', 'Penghuni', 'Penghuni using the resident PWA.'),
    ('property_owner', 'Pemilik Rumah Kost', 'Read-only property owner/investor scoped to owned properties.')
)
INSERT INTO roles (code, name, description, is_system_role)
SELECT code, name, description, true
FROM role_seed
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system_role = EXCLUDED.is_system_role;

WITH permission_seed(code, name, description) AS (
  VALUES
    ('rbac.manage', 'Manage RBAC', 'Manage roles, permissions, and property role assignment.'),
    ('audit.view', 'View Audit', 'View security and domain audit logs.'),
    ('audit.export', 'Export Audit', 'Export security and audit reports.'),
    ('property.read', 'Read Property', 'Read property profile and scoped property data.'),
    ('property.manage', 'Manage Property', 'Manage property profile and settings.'),
    ('room.read', 'Read Room', 'Read room data.'),
    ('room.manage', 'Manage Room', 'Create or update room operational data.'),
    ('resident.read', 'Read Penghuni', 'Read Penghuni/resident data within scope.'),
    ('resident.manage', 'Manage Penghuni', 'Create or update Penghuni/resident data.'),
    ('lease.manage', 'Manage Lease', 'Manage lease, check-in, and check-out workflows.'),
    ('checkout.manage', 'Manage Check-Out', 'Approve, inspect, and finalize check-out workflows.'),
    ('deposit.manage', 'Manage Deposit', 'Manage deposit charge, deduction, refund, and settlement.'),
    ('billing.read', 'Read Billing', 'Read billing, payment, and revenue data.'),
    ('billing.self.read', 'Read Own Billing', 'Read own billing and payment history.'),
    ('billing.manage', 'Manage Billing', 'Create or mutate billing and invoice records.'),
    ('payment.verify', 'Verify Payment', 'Verify or reject manual payment proof.'),
    ('complaint.manage', 'Manage Complaint', 'Manage complaints and work order status.'),
    ('maintenance.manage', 'Manage Maintenance', 'Manage maintenance work orders.'),
    ('smart_lock.read', 'Read Smart Lock', 'Read smart lock metadata, alerts, and access logs.'),
    ('smart_lock.manage', 'Manage Smart Lock', 'Manage smart lock devices, credentials, and restrictions.'),
    ('smart_lock.view', 'View Smart Lock', 'View smart lock metadata and security reports.'),
    ('smart_lock.command', 'Command Smart Lock', 'Execute lock or unlock commands.'),
    ('smart_lock.gateway.read', 'Read Smart Lock Gateway', 'View Smart Lock gateway registry and health.'),
    ('smart_lock.gateway.manage', 'Manage Smart Lock Gateway', 'Manage Smart Lock gateway status, capacity, and onboarding metadata.'),
    ('smart_lock.gateway.credentials.rotate', 'Rotate Smart Lock Gateway Credentials', 'Rotate Smart Lock gateway credential references.'),
    ('smart_lock.device.onboard', 'Onboard Smart Lock Device', 'Bind Smart Lock devices to gateways during onboarding.'),
    ('smart_lock.device.migrate', 'Migrate Smart Lock Device', 'Move Smart Lock device mapping through controlled migration.'),
    ('cctv.view', 'View CCTV', 'View CCTV metadata and preview sessions.'),
    ('notification.manage', 'Manage Notification', 'Manage announcements and notification content.'),
    ('report.view', 'View Report', 'View operational reports.'),
    ('report.export', 'Export Report', 'Export operational reports.'),
    ('property_owner.report.view', 'View Property Owner Report', 'Read-only property owner reports.')
)
INSERT INTO permissions (code, name, description)
SELECT code, name, description
FROM permission_seed
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('owner', 'rbac.manage'),
    ('owner', 'audit.view'),
    ('owner', 'audit.export'),
    ('owner', 'property.read'),
    ('owner', 'property.manage'),
    ('owner', 'room.read'),
    ('owner', 'room.manage'),
    ('owner', 'resident.read'),
    ('owner', 'resident.manage'),
    ('owner', 'lease.manage'),
    ('owner', 'checkout.manage'),
    ('owner', 'deposit.manage'),
    ('owner', 'billing.read'),
    ('owner', 'billing.manage'),
    ('owner', 'payment.verify'),
    ('owner', 'complaint.manage'),
    ('owner', 'maintenance.manage'),
    ('owner', 'smart_lock.read'),
    ('owner', 'smart_lock.manage'),
    ('owner', 'smart_lock.view'),
    ('owner', 'smart_lock.command'),
    ('owner', 'smart_lock.gateway.read'),
    ('owner', 'smart_lock.gateway.manage'),
    ('owner', 'smart_lock.gateway.credentials.rotate'),
    ('owner', 'smart_lock.device.onboard'),
    ('owner', 'smart_lock.device.migrate'),
    ('owner', 'cctv.view'),
    ('owner', 'notification.manage'),
    ('owner', 'report.view'),
    ('owner', 'report.export'),
    ('manager', 'audit.view'),
    ('manager', 'property.read'),
    ('manager', 'property.manage'),
    ('manager', 'room.read'),
    ('manager', 'room.manage'),
    ('manager', 'resident.read'),
    ('manager', 'resident.manage'),
    ('manager', 'lease.manage'),
    ('manager', 'checkout.manage'),
    ('manager', 'deposit.manage'),
    ('manager', 'billing.read'),
    ('manager', 'billing.manage'),
    ('manager', 'payment.verify'),
    ('manager', 'complaint.manage'),
    ('manager', 'maintenance.manage'),
    ('manager', 'smart_lock.read'),
    ('manager', 'smart_lock.manage'),
    ('manager', 'smart_lock.view'),
    ('manager', 'smart_lock.command'),
    ('manager', 'smart_lock.gateway.read'),
    ('manager', 'smart_lock.gateway.manage'),
    ('manager', 'smart_lock.device.onboard'),
    ('manager', 'smart_lock.device.migrate'),
    ('manager', 'cctv.view'),
    ('manager', 'notification.manage'),
    ('manager', 'report.view'),
    ('manager', 'report.export'),
    ('admin', 'property.read'),
    ('admin', 'room.read'),
    ('admin', 'room.manage'),
    ('admin', 'resident.read'),
    ('admin', 'resident.manage'),
    ('admin', 'lease.manage'),
    ('admin', 'checkout.manage'),
    ('admin', 'billing.read'),
    ('admin', 'payment.verify'),
    ('admin', 'complaint.manage'),
    ('admin', 'maintenance.manage'),
    ('admin', 'smart_lock.read'),
    ('admin', 'smart_lock.manage'),
    ('admin', 'smart_lock.view'),
    ('admin', 'smart_lock.gateway.read'),
    ('admin', 'cctv.view'),
    ('admin', 'notification.manage'),
    ('admin', 'report.view'),
    ('technician', 'complaint.manage'),
    ('technician', 'maintenance.manage'),
    ('resident', 'property.read'),
    ('resident', 'room.read'),
    ('resident', 'billing.self.read'),
    ('property_owner', 'property.read'),
    ('property_owner', 'room.read'),
    ('property_owner', 'resident.read'),
    ('property_owner', 'billing.read'),
    ('property_owner', 'property_owner.report.view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM grants
JOIN roles ON roles.code = grants.role_code
JOIN permissions ON permissions.code = grants.permission_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
