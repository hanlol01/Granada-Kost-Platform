import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DEV_USER_SEEDS,
  PERMISSIONS,
  ROLE_PERMISSION_GRANTS,
} from '../../src/infrastructure/database/seeds/core-seed.data';

const LEASE_READ_PERMISSION = [
  'lease.read',
  'Read Lease',
  'Read lease data within an authorized property scope.',
] as const;
const DASHBOARD_PERMISSIONS = ['room.read', 'lease.read', 'billing.read'] as const;
const DASHBOARD_ROLES = ['owner', 'manager', 'admin'] as const;
const DENIED_ROLES = ['technician', 'resident', 'property_owner'] as const;
const sqlSeedPath = resolve(__dirname, '../../src/infrastructure/database/seeds/001_rbac_seed.sql');

function grantsFor(roleCode: string): string[] {
  return ROLE_PERMISSION_GRANTS.filter(([role]) => role === roleCode).map(
    ([, permission]) => permission,
  );
}

function occurrenceCount(source: string, value: string): number {
  return source.split(value).length - 1;
}

test('canonical seed declares the exact lease.read permission once', () => {
  const matches = PERMISSIONS.filter(([code]) => code === 'lease.read');

  assert.deepEqual(matches, [LEASE_READ_PERMISSION]);
});

test('lease.read is granted exactly once only to owner, manager, and admin', () => {
  for (const role of DASHBOARD_ROLES) {
    assert.equal(
      ROLE_PERMISSION_GRANTS.filter(
        ([roleCode, permissionCode]) => roleCode === role && permissionCode === 'lease.read',
      ).length,
      1,
    );
  }

  for (const role of DENIED_ROLES) {
    assert.equal(
      ROLE_PERMISSION_GRANTS.filter(
        ([roleCode, permissionCode]) => roleCode === role && permissionCode === 'lease.read',
      ).length,
      0,
    );
  }
});

test('dashboard roles receive the complete read permission tuple', () => {
  for (const role of DASHBOARD_ROLES) {
    const grants = new Set(grantsFor(role));
    for (const permission of DASHBOARD_PERMISSIONS) {
      assert.equal(grants.has(permission), true, `${role} is missing ${permission}`);
    }
  }
});

test('development admin account keeps the admin role', () => {
  const adminUsers = DEV_USER_SEEDS.filter(({ email }) => email === 'dev.admin@kostation.test');

  assert.equal(adminUsers.length, 1);
  assert.equal(adminUsers[0].roleCode, 'admin');
});

test('canonical TypeScript lease.read contract matches the existing SQL seed', async () => {
  const sql = await readFile(sqlSeedPath, 'utf8');
  const permissionTuple = `('${LEASE_READ_PERMISSION[0]}', '${LEASE_READ_PERMISSION[1]}', '${LEASE_READ_PERMISSION[2]}')`;

  assert.equal(occurrenceCount(sql, permissionTuple), 1);
  for (const role of DASHBOARD_ROLES) {
    assert.equal(occurrenceCount(sql, `('${role}', 'lease.read')`), 1);
  }
  for (const role of DENIED_ROLES) {
    assert.equal(occurrenceCount(sql, `('${role}', 'lease.read')`), 0);
  }
});
