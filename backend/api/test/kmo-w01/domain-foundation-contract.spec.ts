import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  KMO_LIFECYCLE_STATUSES,
  mapKmoLegacyLifecycle,
} from '../../../../packages/domain/src/kmo-lifecycle';
import {
  RECONCILIATION_CHECKS,
  reconcileKmoDomain,
} from '../../src/infrastructure/database/scripts/reconcile-kmo-domain';
import { DomainEvidenceRepository } from '../../src/infrastructure/audit/domain-evidence.repository';

const root = resolve(__dirname, '../../../..');
const UUIDS = {
  propertyId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  aggregateId: '33333333-3333-4333-8333-333333333333',
  correlationId: '44444444-4444-4444-8444-444444444444',
};

void test('KMO-W01 canonical vocabulary maps only evidence-independent legacy states', () => {
  assert.equal(KMO_LIFECYCLE_STATUSES.room.includes('inspection_required'), true);
  assert.equal(KMO_LIFECYCLE_STATUSES.room.includes('inactive'), true);
  assert.deepEqual(mapKmoLegacyLifecycle('invoice', 'partial'), {
    outcome: 'mapped',
    domain: 'invoice',
    legacyValue: 'partial',
    targetValue: 'partially_paid',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('lease', 'ended'), {
    outcome: 'mapped',
    domain: 'lease',
    legacyValue: 'ended',
    targetValue: 'completed',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('billingCycle', 'monthly'), {
    outcome: 'mapped',
    domain: 'billingCycle',
    legacyValue: 'monthly',
    targetValue: 'legacy_monthly',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('billingCycle', 'yearly'), {
    outcome: 'mapped',
    domain: 'billingCycle',
    legacyValue: 'yearly',
    targetValue: 'legacy_yearly',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('complaint', 'open'), {
    outcome: 'mapped',
    domain: 'complaint',
    legacyValue: 'open',
    targetValue: 'submitted',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('bookingLead', 'converted'), {
    outcome: 'unresolved',
    domain: 'bookingLead',
    legacyValue: 'converted',
    reasonCode: 'BOOKING_LEAD_HISTORY_REQUIRED',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('account', 'legacy-without-link'), {
    outcome: 'unresolved',
    domain: 'account',
    legacyValue: 'legacy-without-link',
    reasonCode: 'ACCOUNT_LINK_REQUIRED',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('payment', 'legacy-without-allocation'), {
    outcome: 'unresolved',
    domain: 'payment',
    legacyValue: 'legacy-without-allocation',
    reasonCode: 'PAYMENT_ALLOCATION_REQUIRED',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('occupancy', 'unknown'), {
    outcome: 'unresolved',
    domain: 'occupancy',
    legacyValue: 'unknown',
    reasonCode: 'ACTIVE_LEASE_REQUIRED',
  });
  assert.deepEqual(mapKmoLegacyLifecycle('ownership', 'legacy-property-wide'), {
    outcome: 'unresolved',
    domain: 'ownership',
    legacyValue: 'legacy-property-wide',
    reasonCode: 'BUILDING_OWNERSHIP_REQUIRED',
  });
  assert.equal(mapKmoLegacyLifecycle('invoice', 'unknown').outcome, 'unresolved');
});

void test('KMO-W01 reconciliation is query-only and returns count/outcome evidence', async () => {
  const counts = [0, 2, 8, 0, 1, 0, 0, 0, 26];
  const calls: string[] = [];
  const results = await reconcileKmoDomain({
    query: async (sql: string) => {
      calls.push(sql);
      return { rows: [{ count: counts.shift()! }] } as never;
    },
  } as never);

  assert.equal(results.length, RECONCILIATION_CHECKS.length);
  assert.deepEqual(Object.keys(results[0]!).sort(), ['check', 'count', 'outcome']);
  assert.equal(
    results.find((item) => item.check === 'occupancy.active_lease_link')?.outcome,
    'legacy_compatible',
  );
  assert.equal(
    results.find((item) => item.check === 'payment.allocation_total')?.outcome,
    'matched',
  );
  assert.equal(results.at(-1)?.outcome, 'not_yet_representable');
  for (const sql of calls) {
    assert.match(sql, /^SELECT/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
    assert.doesNotMatch(sql, /SELECT\s+\*/i);
  }
  assert.doesNotMatch(
    JSON.stringify(results),
    /property_id|room_id|resident_id|email|phone|address/i,
  );
  const roomScope = RECONCILIATION_CHECKS.find((item) => item.check === 'room.building_scope')!;
  const roomLifecycle = RECONCILIATION_CHECKS.find(
    (item) => item.check === 'room.lifecycle_authority',
  )!;
  const payment = RECONCILIATION_CHECKS.find((item) => item.check === 'payment.allocation_total')!;
  assert.match(roomScope.sql, /gender_policy/);
  assert.match(roomLifecycle.sql, /FROM leases/);
  assert.match(roomLifecycle.sql, /h\.property_id <> r\.property_id/);
  assert.match(payment.sql, /allocations\.total <> p\.amount/);
  assert.match(payment.sql, /i\.property_id <> p\.property_id/);
  assert.match(payment.sql, /i\.resident_id IS DISTINCT FROM p\.resident_id/);
  assert.equal(payment.findingOutcome, 'unresolved');

  const occupancyIndex = RECONCILIATION_CHECKS.findIndex(
    (item) => item.check === 'occupancy.active_lease_link',
  );
  const ownershipIndex = RECONCILIATION_CHECKS.findIndex(
    (item) => item.check === 'building.ownership_authority',
  );
  const runWithCounts = (values: number[]) =>
    reconcileKmoDomain({
      query: async () => ({ rows: [{ count: values.shift()! }] }) as never,
    } as never);
  const expectedLegacy = Array(RECONCILIATION_CHECKS.length).fill(0);
  expectedLegacy[occupancyIndex] = 8;
  expectedLegacy[ownershipIndex] = 26;
  const expectedResults = await runWithCounts(expectedLegacy);
  assert.equal(expectedResults[occupancyIndex]!.outcome, 'legacy_compatible');
  assert.equal(expectedResults[ownershipIndex]!.outcome, 'not_yet_representable');

  const unexpectedGrowth = Array(RECONCILIATION_CHECKS.length).fill(0);
  unexpectedGrowth[occupancyIndex] = 9;
  unexpectedGrowth[ownershipIndex] = 27;
  const unexpectedResults = await runWithCounts(unexpectedGrowth);
  assert.equal(unexpectedResults[occupancyIndex]!.outcome, 'blocking');
  assert.equal(unexpectedResults[ownershipIndex]!.outcome, 'blocking');

  const resident = RECONCILIATION_CHECKS.find((item) => item.check === 'resident.user_role')!;
  assert.match(resident.sql, /r\.user_id IS NULL/);
  assert.match(resident.sql, /ur\.property_id = r\.property_id/);
  assert.doesNotMatch(resident.sql, /ur\.property_id IS NULL/);
  const invoice = RECONCILIATION_CHECKS.find(
    (item) => item.check === 'invoice.verified_allocations',
  )!;
  assert.match(invoice.sql, /p\.property_id <> i\.property_id/);
  assert.match(invoice.sql, /p\.resident_id IS DISTINCT FROM i\.resident_id/);
  const deposit = RECONCILIATION_CHECKS.find((item) => item.check === 'lease.deposit_aggregate')!;
  assert.match(deposit.sql, /t\.property_id <> l\.property_id/);
  assert.match(deposit.sql, /p\.resident_id IS DISTINCT FROM l\.resident_id/);
});

void test('KMO-W01 domain evidence uses one required client and rejects unsafe envelopes', async () => {
  const auditCalls: Array<{ client: unknown; input: unknown }> = [];
  const queryCalls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[]) => {
      queryCalls.push({ sql, values });
      return { rows: [] };
    },
  };
  const repository = new DomainEvidenceRepository({
    write: async (input: unknown, suppliedClient: unknown) => {
      auditCalls.push({ input, client: suppliedClient });
    },
  } as never);
  const safe = {
    ...UUIDS,
    aggregateType: 'room.inventory',
    action: 'room.inventory.reconciled',
    eventType: 'room.inventory.reconciled',
    eventKey: 'room.inventory.reconciled_once',
    occurredAt: '2026-07-30T00:00:00.000Z',
    resultStatus: 'success' as const,
    affectedCount: 1,
    reasonCode: 'KMO_RECONCILED',
  };

  await repository.write(safe, client as never);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0]!.client, client);
  assert.equal(queryCalls.length, 1);
  assert.match(queryCalls[0]!.sql, /INSERT INTO business_events/);
  const serialized = JSON.stringify({ auditCalls, queryCalls });
  assert.doesNotMatch(serialized, /phone|email|address|token|password|authorization/i);

  for (const mutation of [
    { ...safe, phone: '08123456789' },
    { ...safe, metadata: { nested: { email: 'private@example.test' } } },
    { ...safe, rawRequest: { authorization: 'Bearer private' } },
    { ...safe, rawResponse: { address: 'private address' } },
    { ...safe, databaseUrl: 'postgres://private' },
    { ...safe, filePath: 'private/path' },
    { ...safe, reasonCode: 'raw free form reason' },
    { ...safe, affectedCount: -1 },
    { ...safe, correlationId: 'not-a-uuid' },
    { ...safe, occurredAt: '2026-07-30' },
  ]) {
    await assert.rejects(repository.write(mutation as never, client as never));
  }
  assert.equal(queryCalls.length, 1);

  const transactionCalls: string[] = [];
  let pendingWrites: string[] = [];
  const committedWrites: string[] = [];
  const failingClient = {
    query: async (sql: string) => {
      transactionCalls.push(sql);
      if (sql === 'BEGIN') pendingWrites = [];
      if (sql.includes('INSERT INTO audit_logs')) pendingWrites.push('audit');
      if (sql.includes('INSERT INTO business_events')) throw new Error('event unavailable');
      if (sql === 'COMMIT') committedWrites.push(...pendingWrites);
      if (sql === 'ROLLBACK') pendingWrites = [];
      return { rows: [] };
    },
  };
  const transactionalRepository = new DomainEvidenceRepository({
    write: async (_input: unknown, suppliedClient: typeof failingClient) => {
      await suppliedClient.query('INSERT INTO audit_logs (safe) VALUES (true)');
    },
  } as never);
  await failingClient.query('BEGIN');
  await assert.rejects(
    transactionalRepository.write(safe, failingClient as never),
    /event unavailable/,
  );
  await failingClient.query('ROLLBACK');
  assert.deepEqual(committedWrites, []);
  assert.deepEqual(pendingWrites, []);
  assert.equal(transactionCalls.filter((sql) => sql.includes('INSERT INTO audit_logs')).length, 1);
  assert.equal(
    transactionCalls.filter((sql) => sql.includes('INSERT INTO business_events')).length,
    1,
  );
});

void test('KMO-W01 carrier and scripts remain exact, import-safe, and correlation-aware', async () => {
  const [auth, iam, admin, middleware, migrate, reconcile, auditModule] = await Promise.all([
    readFile(resolve(root, 'backend/api/src/modules/auth/auth.service.ts'), 'utf8'),
    readFile(resolve(root, 'backend/api/src/modules/iam/repositories/iam.repository.ts'), 'utf8'),
    readFile(resolve(root, 'apps/admin/src/lib/admin-ux-dashboard.ts'), 'utf8'),
    readFile(resolve(root, 'backend/api/src/app/middleware/correlation-id.middleware.ts'), 'utf8'),
    readFile(resolve(root, 'backend/api/src/infrastructure/database/scripts/migrate.ts'), 'utf8'),
    readFile(
      resolve(root, 'backend/api/src/infrastructure/database/scripts/reconcile-kmo-domain.ts'),
      'utf8',
    ),
    readFile(resolve(root, 'backend/api/src/infrastructure/audit/audit.module.ts'), 'utf8'),
  ]);
  assert.match(auth, /bookingHoldWriteEnabled === true/);
  assert.match(iam, /COALESCE\(property_feature_flags\.booking_hold_write, FALSE\)/);
  assert.match(admin, /hasOnlyKeys/);
  assert.match(middleware, /correlationId/);
  assert.match(migrate, /if \(require\.main === module\)/);
  assert.match(migrate, /explicitDatabaseConfigFromEnv/);
  assert.match(migrate, /resolve\(__dirname, '\.\.\/\.\.\/\.\.\/\.\.\/\.env'\)/);
  assert.doesNotMatch(migrate, /resolve\(process\.cwd\(\), '\.env'\)/);
  assert.match(reconcile, /if \(require\.main === module\)/);
  assert.match(reconcile, /explicitDatabaseConfigFromEnv/);
  assert.match(reconcile, /BEGIN READ ONLY/);
  assert.doesNotMatch(reconcile, /resolve\(process\.cwd\(\), '\.env'\)/);
  assert.match(auditModule, /DomainEvidenceRepository/);
});
