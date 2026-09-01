import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { projectLeaseSettlementV2 } from '../../src/modules/billing/helpers/lease-settlement-projection.helper';
import { ContractSettlementService } from '../../src/modules/billing/services/contract-settlement.service';

const root = join(import.meta.dirname, '..', '..');
const source = (path: string) => readFileSync(join(root, path), 'utf8');

void test('M4 migration is manifest-bound and adds append-only operational authority', () => {
  const file = '051_lease_settlement_overdue_operations.sql';
  const sql = source(`src/infrastructure/database/migrations/${file}`);
  const entry = MIGRATION_MANIFEST.find((candidate) => candidate.version === file);
  assert.ok(entry);
  assert.equal(createHash('sha256').update(sql).digest('hex'), entry.checksumSha256);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS lease_payment_promises/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS lease_settlement_notification_ledger/);
  assert.match(sql, /CREATE OR REPLACE VIEW lease_settlement_v2_current_projection/);
  assert.match(sql, /lease_settlement_scheduler BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /UNIQUE \(checkpoint_id, notification_kind, recipient_user_id\)/);
  assert.match(sql, /promise_to_pay_recorded/);
  assert.doesNotMatch(sql, /UPDATE\s+leases\s+SET\s+lease_status\s*=\s*'terminated'/i);
  assert.doesNotMatch(sql, /UPDATE\s+rooms\s+SET\s+room_status\s*=\s*'vacant'/i);
});

void test('overdue projection preserves grace and makes an expired extension termination-eligible', () => {
  const checkpoint = {
    id: 'checkpoint-1',
    code: 'checkpoint_1' as const,
    sequence: 1,
    mode: 'minimum_monthly_coverage' as const,
    dueAt: new Date('2026-09-28T16:59:59.999Z'),
    cumulativeRequiredAmount: 3_600_000,
  };
  const final = {
    id: 'final',
    code: 'final_settlement' as const,
    sequence: 2,
    mode: 'exact_remaining_balance' as const,
    dueAt: new Date('2026-10-28T16:59:59.999Z'),
    cumulativeRequiredAmount: null,
  };
  const grace = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 5_400_000,
    cumulativeVerifiedRentCredit: 2_800_000,
    authoritativeNow: new Date('2026-09-29T17:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: [checkpoint, final],
  });
  assert.equal(grace.stage, 'overdue_grace');
  assert.equal(grace.checkpointShortfallAmount, 800_000);

  const expired = projectLeaseSettlementV2({
    activated: true,
    terminationPending: false,
    contractRentAmount: 5_400_000,
    cumulativeVerifiedRentCredit: 2_800_000,
    authoritativeNow: new Date('2026-10-13T17:00:00.000Z'),
    gracePeriodDays: 3,
    checkpoints: [{ ...checkpoint, extensionDueAt: new Date('2026-10-12T16:59:59.999Z') }, final],
  });
  assert.equal(expired.stage, 'termination_eligible');
  assert.equal(expired.terminationEligible, true);
});

void test('M4 commands keep extension and promise-to-pay server authoritative', () => {
  const service = source('src/modules/billing/services/contract-settlement.service.ts');
  const controller = source('src/modules/billing/controllers/admin-billing.controller.ts');
  assert.match(service, /lockV2MissedCheckpoint/);
  assert.match(service, /CONTRACT_SETTLEMENT_EXTENSION_DEADLINE_NOT_FUTURE/);
  assert.match(service, /Only one settlement extension can be granted/);
  assert.match(service, /overdue_status_unchanged:\s*true/);
  assert.match(service, /LEASE_PAYMENT_PROMISE_AMOUNT_EXCEEDS_OUTSTANDING/);
  assert.match(service, /v2TerminationIsEligible/);
  assert.match(controller, /contract-settlement\/payment-promise/);
  assert.match(controller, /@RequireRoles\('admin'\)/);
  assert.match(controller, /@RequirePermissions\('lease\.manage'\)/);
});

void test('payment promise is an idempotent audited append without changing lease or room state', async () => {
  const queries: string[] = [];
  const client = {
    query: async (text: string) => {
      await Promise.resolve();
      const sql = text.replace(/\s+/g, ' ').trim();
      queries.push(sql);
      if (/INSERT INTO idempotency_commands/.test(sql))
        return { rows: [{ id: 'command-id' }], rowCount: 1 };
      if (/SELECT settlement\.id.*FOR UPDATE OF settlement,lease,invoice/.test(sql))
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              property_id: '22222222-2222-4222-8222-222222222222',
              lease_id: '33333333-3333-4333-8333-333333333333',
              invoice_id: '44444444-4444-4444-8444-444444444444',
              state: 'open',
              activated_at: new Date('2026-08-28T00:00:00.000Z'),
              original_due_at: null,
              extension_due_at: null,
              total_amount: '10800000',
              credit_amount: '1800000',
              allocated_amount: '0',
              room_id: '55555555-5555-4555-8555-555555555555',
              occupancy_id: '66666666-6666-4666-8666-666666666666',
              lease_status: 'active',
              policy_snapshot_id: '77777777-7777-4777-8777-777777777777',
            },
          ],
          rowCount: 1,
        };
      if (/WITH ledger AS .*FROM authority.*shortfall_amount>0/.test(sql))
        return {
          rows: [
            {
              checkpoint_id: '88888888-8888-4888-8888-888888888888',
              policy_snapshot_id: '77777777-7777-4777-8777-777777777777',
              checkpoint_code: 'checkpoint_1',
              original_due_at: new Date('2026-09-28T16:59:59.999Z'),
              extension_id: null,
              extension_due_at: null,
              contract_rent_amount: '10800000',
              verified_rent_credit: '2800000',
              outstanding_amount: '8000000',
              shortfall_amount: '800000',
            },
          ],
          rowCount: 1,
        };
      if (/promised_payment_date cannot be in the past/.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT \$1::date >= .* AS valid/.test(sql))
        return { rows: [{ valid: true }], rowCount: 1 };
      if (/INSERT INTO lease_payment_promises/.test(sql))
        return {
          rows: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              recorded_at: new Date('2026-09-30T03:00:00.000Z'),
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new ContractSettlementService(
    {
      transaction: async (operation: (transactionClient: typeof client) => Promise<unknown>) =>
        operation(client),
    } as never,
    {
      assertCanReadProperty: async () => {
        await Promise.resolve();
      },
    } as never,
    {
      write: async () => {
        await Promise.resolve();
      },
    } as never,
    {} as never,
  );
  const response = await service.recordPaymentPromise(
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never,
    '33333333-3333-4333-8333-333333333333',
    {
      property_id: '22222222-2222-4222-8222-222222222222',
      promised_amount: 800_000,
      promised_payment_date: '2026-10-02',
      note: 'Akan ditransfer setelah konfirmasi keluarga',
    },
    'm4-promise-idempotency-key',
    { correlationId: 'm4-test' },
  );
  assert.equal(response.data.overdue_status_unchanged, true);
  assert.equal(response.data.promised_amount, 800_000);
  assert.ok(queries.some((query) => /INSERT INTO lease_payment_promises/.test(query)));
  assert.ok(queries.some((query) => /promise_to_pay_recorded/.test(query)));
  assert.equal(
    queries.some((query) => /UPDATE leases SET lease_status/.test(query)),
    false,
  );
  assert.equal(
    queries.some((query) => /UPDATE rooms SET room_status/.test(query)),
    false,
  );
});

void test('resident list and filters consume the authoritative V2 settlement projection', () => {
  const repository = source('src/modules/resident/repositories/resident.repository.ts');
  const query = source('src/modules/resident/dto/list-residents-query.dto.ts');
  const lifecycleProjection = source(
    'src/infrastructure/database/migrations/055_resident_lifecycle_read_model_m7.sql',
  );
  assert.equal((repository.match(/resident_admin_lifecycle_projection/g) ?? []).length, 3);
  assert.match(lifecycleProjection, /LEFT JOIN lease_settlement_v2_current_projection v2/);
  assert.match(query, /lease_end_within_days/);
  assert.match(repository, /projection\.lease_end IS NOT NULL/);
  assert.match(repository, /CASE WHEN \$13::integer IS NOT NULL THEN projection\.lease_end/);
  for (const stage of [
    'checkpoint_two_pending',
    'checkpoint_two_met',
    'overdue_grace',
    'extended',
    'termination_eligible',
  ])
    assert.match(query, new RegExp(stage));
});

void test('M4 scheduler is double-gated, idempotent, and never checks out a resident', () => {
  const scheduler = source(
    'src/modules/billing/services/contract-settlement-lifecycle.scheduler.ts',
  );
  assert.match(scheduler, /settlementSchedulerProcessEnabled/);
  assert.match(scheduler, /lease_settlement_scheduler=true/);
  assert.match(scheduler, /pg_try_advisory_lock/);
  assert.match(
    scheduler,
    /ON CONFLICT\(checkpoint_id,notification_kind,recipient_user_id\) DO NOTHING/,
  );
  for (const kind of [
    'h_minus_7',
    'h_minus_3',
    'h_minus_1',
    'due_today',
    'overdue_h_plus_1',
    'grace_ended',
    'termination_eligible',
    'extension_expiring',
    'extension_expired',
  ])
    assert.match(scheduler, new RegExp(kind));
  assert.doesNotMatch(scheduler, /UPDATE\s+leases\s+SET\s+lease_status/i);
  assert.doesNotMatch(scheduler, /UPDATE\s+rooms\s+SET\s+room_status/i);
  assert.doesNotMatch(scheduler, /INSERT INTO lease_termination_cases/i);
});
