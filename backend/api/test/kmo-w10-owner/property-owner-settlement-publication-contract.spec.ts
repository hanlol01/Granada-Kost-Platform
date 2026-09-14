import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';

const root = resolve(__dirname, '../..');
const source = (path: string) => readFile(resolve(root, path), 'utf8');

test('owner settlement publication is immutable and payout-gated', async () => {
  const migration = await source(
    'src/infrastructure/database/migrations/080_property_owner_settlement_publication.sql',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS property_owner_settlement_publications/);
  assert.match(migration, /snapshot JSONB NOT NULL/);
  assert.match(migration, /PROPERTY_OWNER_SETTLEMENT_PUBLICATION_APPEND_ONLY/);
  assert.match(migration, /publication_status = 'published'/);
  assert.match(migration, /PROPERTY_OWNER_PAYOUT_SETTLEMENT_UNAVAILABLE/);
});

test('migration 080 is registered with authority sentinels', () => {
  const entry = MIGRATION_MANIFEST.find(
    (item) => item.version === '080_property_owner_settlement_publication.sql',
  );
  assert.ok(entry);
  assert.match(entry.checksumSha256, /^[a-f0-9]{64}$/);
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('settlement_publications')));
  assert.ok(entry.sentinels.some((sentinel) => sentinel.includes('transferred_at')));
});

test('admin settlement flow separates preparation, review, approval, publication, and payout', async () => {
  const service = await source(
    'src/modules/property-owner-management/property-owner-report.service.ts',
  );
  assert.match(service, /prepare\(/);
  assert.match(service, /submitReview\(/);
  assert.match(service, /approve\(/);
  assert.match(service, /publish\(/);
  assert.match(service, /recordPayout\(/);
  assert.match(service, /addAdjustment\(/);
  assert.match(service, /adjustments: adjustments\.rows/);
  assert.match(service, /adjustment_status='approved'/);
  assert.match(service, /PROPERTY_OWNER_SETTLEMENT_CHANGED_AFTER_REVIEW/);
  assert.match(service, /PROPERTY_OWNER_SETTLEMENT_NOT_PUBLISHED/);
  assert.match(service, /PROPERTY_OWNER_PAYOUT_REMAINDER_EXCEEDED/);
  assert.match(service, /dto\.earning_id/);
  assert.match(service, /INSERT INTO idempotency_commands/);
  assert.match(service, /this\.audit\.write/);
});

test('legacy close route now prepares a draft instead of auto-approving it', async () => {
  const controller = await source(
    'src/modules/property-owner-management/property-owner-management.controller.ts',
  );
  const closeRegion = controller.slice(controller.indexOf("@Post(':ownerId/report-periods/close')"));
  assert.match(closeRegion, /this\.ownerReports\.prepare/);
  assert.doesNotMatch(closeRegion.slice(0, 900), /this\.owners\.closeReportPeriod/);
});

test('owner portal settlement authority requires an explicit publication', async () => {
  const portal = await source(
    'src/modules/property-owner-management/property-owner-portal.service.ts',
  );
  assert.match(portal, /property_owner_settlement_publications/);
  assert.match(portal, /publication_status = 'published'/);
});
