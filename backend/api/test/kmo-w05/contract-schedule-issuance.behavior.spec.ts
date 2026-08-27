import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { ContractScheduleIssuanceService } from '../../src/modules/billing/services/contract-schedule-issuance.service';

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

void test('contract schedule invoice issuance supplies the lease predicate parameter', async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 1 });
    },
  } as unknown as PoolClient;

  await new ContractScheduleIssuanceService().issueScheduleInTransaction(client, {
    propertyId: PROPERTY_ID,
    leaseId: LEASE_ID,
    startDate: '2026-08-24',
    termMonths: 3,
    paymentPlanType: 'annual_full',
    contractRentAmount: 5_400_000,
    billingCycle: 'monthly',
    snapshotMonthlyPrice: 1_800_000,
    snapshotRoomNumber: 'AK-18-01',
    snapshotBuildingCode: 'AK-18',
    snapshotCategoryName: 'Apart Kost',
    initialRentCredit: 0,
    actorUserId: ACTOR_ID,
  });

  const invoiceInsert = queries.find(({ sql }) => sql.includes('INSERT INTO invoices('));
  assert.ok(invoiceInsert, 'contract schedule must issue an invoice');
  assert.equal(invoiceInsert.params.length, 20);
  assert.equal(invoiceInsert.params[19], LEASE_ID);
});
