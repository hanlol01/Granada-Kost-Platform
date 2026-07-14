import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { nextJakartaBillingRun } from '../../src/modules/lease/lease-billing.scheduler';
import { nextBillingStart, previousDate } from '../../src/modules/lease/lease-date.helper';

const root = resolve(__dirname, '../..');

test('M6 scheduler targets 00:10 Asia/Jakarta and preserves anchor end-of-month rules', () => {
  assert.equal(nextBillingStart('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextBillingStart('2024-02-29', 'yearly', 29), '2025-02-28');
  assert.equal(previousDate('2024-03-01'), '2024-02-29');

  const beforeRun = nextJakartaBillingRun(new Date('2026-01-01T17:09:00.000Z'));
  assert.equal(beforeRun.toISOString(), '2026-01-01T17:10:00.000Z');
  const exactRun = nextJakartaBillingRun(new Date('2026-01-01T17:10:00.000Z'));
  assert.equal(exactRun.toISOString(), '2026-01-01T17:10:00.000Z');
  const afterRun = nextJakartaBillingRun(new Date('2026-01-01T17:11:00.000Z'));
  assert.equal(afterRun.toISOString(), '2026-01-02T17:10:00.000Z');
});

test('M6 migration is reentrant, deny-by-default, and has no legacy lifecycle backfill', async () => {
  const migration = await readFile(
    resolve(root, 'src/infrastructure/database/migrations/018_lease_m6_runtime.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS property_feature_flags/);
  assert.match(migration, /admin_ux_read BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /lease_transfer BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /lease_billing_scheduler BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /property_feature_flags_dependency_check/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+leases/i);
  assert.doesNotMatch(migration, /UPDATE\s+occupancies/i);
  assert.doesNotMatch(migration, /UPDATE\s+invoices/i);
});

test('M6 transfer preserves non-financial admin access while financial top-up stays owner/manager only', async () => {
  const controller = await readFile(resolve(root, 'src/modules/lease/lease.controller.ts'), 'utf8');
  const transfer = await readFile(
    resolve(root, 'src/modules/lease/lease-transfer.service.ts'),
    'utf8',
  );
  assert.match(controller, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(
    controller,
    /@Post\(':leaseId\/transfer'\)[\s\S]*?@RequirePermissions\('lease.manage'\)/,
  );
  assert.doesNotMatch(
    controller,
    /@Post\(':leaseId\/transfer'\)[\s\S]{0,220}@RequirePermissions\('lease\.manage', 'billing\.manage'\)/,
  );
  assert.match(transfer, /if \(dto\.top_up\) this\.assertFinancialActor\(user\)/);
  assert.match(
    transfer,
    /Only an owner or manager with billing\.manage may perform a financial transfer top-up/,
  );
});

test('M6 transfer enforces half-open same-day transfer, ordered locks, append-only carry-forward, and safe output', async () => {
  const transfer = await readFile(
    resolve(root, 'src/modules/lease/lease-transfer.service.ts'),
    'utf8',
  );
  assert.match(transfer, /TRANSFER_EFFECTIVE_DATE_MUST_BE_TODAY/);
  assert.match(transfer, /occupancy_status = 'transferred', end_date = \$2::date/);
  assert.match(transfer, /lease_status = 'transferred', end_date = \$2::date/);
  assert.match(transfer, /const uniqueSortedIds = \[\.\.\.new Set\(roomIds\)\]\.sort\(\)/);
  assert.match(transfer, /FOR UPDATE/);
  assert.match(transfer, /transactionType: 'carry_forward',[\s\S]*?direction: 'debit'/);
  assert.match(transfer, /transactionType: 'carry_forward',[\s\S]*?direction: 'credit'/);
  assert.match(transfer, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(transfer, /lease\.transferred:/);
  assert.doesNotMatch(transfer, /ktp_number/);
  assert.doesNotMatch(transfer, /storage_path/);
});

test('M6 scheduler uses advisory lock, SKIP LOCKED, retry-safe invoices, bounded catch-up, and default-off process gate', async () => {
  const scheduler = await readFile(
    resolve(root, 'src/modules/lease/lease-billing.scheduler.ts'),
    'utf8',
  );
  const config = await readFile(
    resolve(root, 'src/infrastructure/config/configuration.ts'),
    'utf8',
  );
  assert.match(scheduler, /pg_try_advisory_lock\(hashtext\(\$1\)\)/);
  assert.match(scheduler, /FOR UPDATE SKIP LOCKED/);
  assert.match(
    scheduler,
    /ON CONFLICT \(lease_id, cycle_start_date\) WHERE lease_id IS NOT NULL DO NOTHING/,
  );
  assert.match(scheduler, /MAX_CATCH_UP_CYCLES = 12/);
  assert.match(scheduler, /lease\.billing_catchup_limit_reached/);
  assert.match(scheduler, /environment === 'staging' \|\| environment === 'production'/);
  assert.match(config, /LEASE_BILLING_SCHEDULER_PROCESS_ENABLED === 'true'/);
});
test('M6 resident selector is static, property-scoped, and masked', async () => {
  const controller = await readFile(resolve(root, 'src/modules/lease/lease.controller.ts'), 'utf8');
  const service = await readFile(resolve(root, 'src/modules/lease/lease.service.ts'), 'utf8');

  assert.match(
    controller,
    /@Get\('resident-options'\)[\s\S]*?@RequirePermissions\('lease\.read'\)/,
  );
  assert.ok(
    controller.indexOf("@Get('resident-options')") < controller.indexOf("@Get(':leaseId')"),
  );

  const selector = service.match(/async listResidentOptions\([\s\S]*?\n  async get\(/)?.[0] ?? '';
  assert.match(selector, /display_name_masked: this\.maskName\(row\.full_name\)/);
  assert.doesNotMatch(selector, /phone|email|date_of_birth|ktp_number|storage_path/);
});

test('M6 C1 detail controller returns only whitelisted ledger and history fields', async () => {
  const { LeaseService } = await import('../../src/modules/lease/lease.service');
  const { LeaseController } = await import('../../src/modules/lease/lease.controller');
  const queries: string[] = [];
  const leaseId = '11111111-1111-4111-8111-111111111111';

  const repository = {
    query: async (text: string) => {
      queries.push(text);
      if (text.includes('FROM leases') && text.includes('JOIN residents')) {
        return {
          rows: [
            {
              id: leaseId,
              property_id: '22222222-2222-4222-8222-222222222222',
              lease_code: 'LSE-001',
              resident_id: '33333333-3333-4333-8333-333333333333',
              room_id: '44444444-4444-4444-8444-444444444444',
              occupancy_id: '55555555-5555-4555-8555-555555555555',
              kost_type_id: '66666666-6666-4666-8666-666666666666',
              lease_status: 'active',
              start_date: '2026-08-10',
              end_date: null,
              billing_cycle: 'monthly',
              billing_anchor_day: 10,
              next_billing_date: '2026-09-10',
              snapshot_monthly_price: '1000000',
              snapshot_yearly_price: '12000000',
              snapshot_deposit_amount: '500000',
              snapshot_room_number: 'A-01',
              snapshot_kost_type_name: 'Standard',
              notes: null,
              deposit_collected_amount: '500000',
              deposit_deduction_amount: '0',
              deposit_refunded_amount: '0',
              resident_name: 'Penghuni Aman',
              room_number: 'A-01',
              kost_type_name: 'Standard',
            },
          ],
        };
      }
      if (text.includes('FROM lease_deposit_transactions')) {
        return {
          rows: [
            {
              id: 'ledger-1',
              transaction_type: 'collection',
              direction: 'credit',
              amount: '500000',
              settlement_status: 'settled',
              created_at: new Date('2026-08-10T00:00:00.000Z'),
              reason: 'unsafe reason',
              reason_type: 'unsafe type',
            },
          ],
        };
      }
      if (text.includes('FROM invoices')) return { rows: [] };
      if (text.includes('FROM lease_history')) {
        return {
          rows: [
            {
              id: 'history-1',
              event_type: 'created',
              event_date: '2026-08-10',
              created_at: new Date('2026-08-10T00:00:00.000Z'),
              metadata: { unsafe: true },
            },
          ],
        };
      }
      if (text.includes('FROM kost_type_facility_assignments')) return { rows: [] };
      if (text.includes('FROM room_transfer_records')) return { rows: [] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  const service = new LeaseService(repository as never);
  const controller = new LeaseController(service, {} as never);

  const response = await controller.get(
    { id: 'actor-1', roles: ['owner'], permissions: ['lease.read'], propertyIds: [] },
    leaseId,
  );
  const ledger = response.data.deposit_ledger[0];
  const history = response.data.history[0];

  assert.equal(Object.hasOwn(ledger, 'reason'), false);
  assert.equal(Object.hasOwn(ledger, 'reason_type'), false);
  assert.equal(Object.hasOwn(history, 'metadata'), false);
  assert.deepEqual(ledger, {
    id: 'ledger-1',
    transaction_type: 'collection',
    direction: 'credit',
    amount: 500000,
    settlement_status: 'settled',
    created_at: new Date('2026-08-10T00:00:00.000Z'),
  });
  assert.deepEqual(history, {
    id: 'history-1',
    event_type: 'created',
    event_date: '2026-08-10',
    created_at: new Date('2026-08-10T00:00:00.000Z'),
  });
  const detailSql = queries.join('\n');
  assert.doesNotMatch(detailSql, /SELECT[^;]*reason_type/i);
  assert.doesNotMatch(detailSql, /SELECT[^;]*reason,/i);
  assert.doesNotMatch(detailSql, /SELECT[^;]*metadata/i);
});

test('M6 C2 overdue metadata uses global distinct total before pagination', async () => {
  const { LeaseService } = await import('../../src/modules/lease/lease.service');
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const repository = {
    query: async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      if (text.includes('count(DISTINCT leases.id)')) return { rows: [{ total: '3' }] };
      return { rows: [] };
    },
  };
  const service = new LeaseService(repository as never);
  const user = { id: 'actor-1', roles: ['owner'], permissions: ['lease.read'], propertyIds: [] };
  const propertyId = '22222222-2222-4222-8222-222222222222';

  const first = await service.listOverdue(user, propertyId, 1, 0);
  const second = await service.listOverdue(user, propertyId, 1, 1);

  assert.deepEqual(first.meta, { total: 3, limit: 1, offset: 0 });
  assert.deepEqual(second.meta, { total: 3, limit: 1, offset: 1 });
  const countQueries = queries.filter((query) => query.text.includes('count(DISTINCT leases.id)'));
  const pageQueries = queries.filter((query) => query.text.includes('SELECT DISTINCT ON (leases.id)'));
  assert.equal(countQueries.length, 2);
  assert.equal(pageQueries.length, 2);
  for (const query of countQueries) {
    assert.doesNotMatch(query.text, /LIMIT|OFFSET/);
    assert.match(query.text, /invoices\.invoice_status IN/);
    assert.match(query.text, /invoices\.due_date < \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)::date/);
    assert.match(query.text, /invoices\.total_amount > COALESCE\(allocations\.allocated_amount, 0\)/);
    assert.deepEqual(query.values, [null, propertyId]);
  }
  for (const query of pageQueries) {
    assert.match(query.text, /LIMIT \$3 OFFSET \$4/);
    assert.match(query.text, /invoices\.invoice_status IN/);
    assert.match(query.text, /invoices\.due_date < \(now\(\) AT TIME ZONE 'Asia\/Jakarta'\)::date/);
    assert.match(query.text, /invoices\.total_amount > COALESCE\(allocations\.allocated_amount, 0\)/);
  }
});
