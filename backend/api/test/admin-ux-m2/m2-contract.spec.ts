import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ADMIN_UX_V2_ACCEPT,
  acceptsAdminUxV2,
  normalizePagination,
} from '../../src/shared/admin-ux-v2';

const migrationPath = resolve(
  __dirname,
  '../../src/infrastructure/database/migrations/016_kost_type_revision.sql',
);

test('M2 migration is forward-only and contains fail-closed master contracts', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(
    sql,
    /\bDELETE\s+FROM\s+(?:rooms|residents|invoices|hunian_gallery_images)\b/i,
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS kost_types/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS facility_categories/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS kost_type_facility_assignments/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS kost_type_rules/i);
  assert.match(sql, /M2_PREFLIGHT_KOST_TYPE_FACTS_NOT_UNIFORM/);
  assert.match(sql, /M2_PREFLIGHT_FACILITY_SET_NOT_UNIFORM/);
  assert.match(sql, /M2_RBAC_LEASE_READ_GRANT_INVALID/);
  assert.match(sql, /M2_RBAC_ADMIN_BILLING_MANAGE_FORBIDDEN/);
  assert.match(sql, /target_type IS NULL/);
  assert.match(sql, /'profile_photo'/);
  assert.doesNotMatch(sql, /\bUNION\b/i);
});

test('M2 V2 media negotiation accepts a parameterized media range only', () => {
  assert.equal(acceptsAdminUxV2(ADMIN_UX_V2_ACCEPT), true);
  assert.equal(acceptsAdminUxV2(`${ADMIN_UX_V2_ACCEPT}; charset=utf-8`), true);
  assert.equal(acceptsAdminUxV2(`application/json, ${ADMIN_UX_V2_ACCEPT}`), true);
  assert.equal(acceptsAdminUxV2('application/json'), false);
  assert.equal(acceptsAdminUxV2(undefined), false);
});

test('M2 pagination is bounded deterministically', () => {
  assert.deepEqual(normalizePagination({}), { limit: 20, offset: 0 });
  assert.deepEqual(normalizePagination({ limit: 200, offset: -1 }), { limit: 100, offset: 0 });
  assert.deepEqual(normalizePagination({ limit: 1, offset: 5 }), { limit: 1, offset: 5 });
});
