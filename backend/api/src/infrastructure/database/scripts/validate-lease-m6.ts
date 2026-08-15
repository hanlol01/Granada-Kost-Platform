import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { LeaseBillingScheduler } from '../../../modules/lease/lease-billing.scheduler';
import { LeaseFeatureService } from '../../../modules/lease/lease-feature.service';
import { LeaseRepository } from '../../../modules/lease/lease.repository';
import { LeaseService } from '../../../modules/lease/lease.service';
import { LeaseTransferService } from '../../../modules/lease/lease-transfer.service';
import type { UserAccessContext } from '../../../modules/iam/types/iam.types';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database.service';
import {
  assertDisposableDatabaseConnection,
  disposableDatabasePoolConfig,
  disposableDatabaseTargetFromEnv,
  sanitizedDisposableTarget,
} from './admin-ux-m1/disposable-database';

type Fixture = {
  propertyId: string;
  owner: UserAccessContext;
  admin: UserAccessContext;
  standardTypeId: string;
  premiumTypeId: string;
  rooms: string[];
  residents: string[];
};

const STANDARD_DEPOSIT = 250_000;
const PREMIUM_DEPOSIT = 350_000;

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function actor(id: string, role: 'owner' | 'admin', propertyId: string): UserAccessContext {
  return {
    id,
    email: null,
    phone: null,
    displayName: `M6 ${role}`,
    roles: [role],
    permissions:
      role === 'owner'
        ? ['lease.read', 'lease.manage', 'billing.manage']
        : ['lease.read', 'lease.manage', 'billing.manage'],
    propertyIds: [propertyId],
    sessionId: randomUUID(),
  };
}

function context() {
  return {
    correlationId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'admin-ux-m6-disposable',
  };
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === 'object' && 'code' in response) {
      return String(response.code);
    }
  }
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  return undefined;
}

async function expectReject(work: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => errorCode(error) === code);
}

async function fixture(pool: Pool): Promise<Fixture> {
  const suffix = randomUUID().replaceAll('-', '');
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const propertyId = randomUUID();
  const standardTypeId = randomUUID();
  const premiumTypeId = randomUUID();
  const rooms = Array.from({ length: 11 }, () => randomUUID());
  const residents = Array.from({ length: 9 }, () => randomUUID());

  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, 'm6-fixture', 'M6 Owner'), ($3, $4, 'm6-fixture', 'M6 Admin')`,
    [ownerId, `m6-owner-${suffix}@example.invalid`, adminId, `m6-admin-${suffix}@example.invalid`],
  );
  await pool.query(
    `INSERT INTO properties (id, name, address, timezone, status, created_by_user_id, updated_by_user_id)
     VALUES ($1, 'M6 Disposable Fixture', 'Synthetic only', 'Asia/Jakarta', 'active', $2, $2)`,
    [propertyId, ownerId],
  );
  await pool.query(`INSERT INTO property_settings (property_id, default_due_day) VALUES ($1, 25)`, [
    propertyId,
  ]);
  await pool.query(
    `INSERT INTO kost_types (
       id, property_id, category, name, slug, monthly_price, yearly_price, deposit_amount,
       status, created_by_user_id, updated_by_user_id
     ) VALUES
       ($1, $2, 'rukost', 'M6 Standard', $3, 1000000, 12000000, $4, 'active', $5, $5),
       ($6, $2, 'apartkost', 'M6 Premium', $7, 1300000, 15600000, $8, 'active', $5, $5)`,
    [
      standardTypeId,
      propertyId,
      `m6-standard-${suffix}`,
      STANDARD_DEPOSIT,
      ownerId,
      premiumTypeId,
      `m6-premium-${suffix}`,
      PREMIUM_DEPOSIT,
    ],
  );
  for (const [index, roomId] of rooms.entries()) {
    await pool.query(
      `INSERT INTO rooms (
         id, property_id, number, category, monthly_price, deposit_amount, room_status, kost_type_id,
         created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'vacant', $7, $8, $8)`,
      [
        roomId,
        propertyId,
        `M6-${String(index + 1).padStart(2, '0')}-${suffix.slice(0, 6)}`,
        index === 2 ? 'apartkost' : 'rukost',
        index === 2 ? 1300000 : 1000000,
        index === 2 ? PREMIUM_DEPOSIT : STANDARD_DEPOSIT,
        index === 2 ? premiumTypeId : standardTypeId,
        ownerId,
      ],
    );
  }
  for (const [index, residentId] of residents.entries()) {
    await pool.query(
      `INSERT INTO residents (
         id, property_id, full_name, resident_status, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, 'active', $4, $4)`,
      [residentId, propertyId, `M6 Resident ${index + 1}`, ownerId],
    );
  }
  await pool.query(
    `INSERT INTO property_feature_flags (
       property_id, admin_ux_read, lease_write, lease_transfer, lease_billing_scheduler,
       created_by_user_id, updated_by_user_id
     ) VALUES ($1, true, true, true, true, $2, $2)`,
    [propertyId, ownerId],
  );
  return {
    propertyId,
    owner: actor(ownerId, 'owner', propertyId),
    admin: actor(adminId, 'admin', propertyId),
    standardTypeId,
    premiumTypeId,
    rooms,
    residents,
  };
}

async function createLease(
  service: LeaseService,
  owner: UserAccessContext,
  propertyId: string,
  roomId: string,
  residentId: string,
): Promise<string> {
  const created = await service.create(
    owner,
    {
      property_id: propertyId,
      room_id: roomId,
      resident_id: residentId,
      start_date: jakartaToday(),
      billing_cycle: 'monthly',
      billing_anchor_day: 1,
    },
    `m6-create-${randomUUID()}`,
    context(),
  );
  return (created.body.data as { lease: { id: string } }).lease.id;
}

async function collectRequiredDeposit(
  service: LeaseService,
  owner: UserAccessContext,
  leaseId: string,
  amount = STANDARD_DEPOSIT,
): Promise<void> {
  await service.collectDeposit(
    owner,
    leaseId,
    {
      transaction_type: 'collection',
      amount,
      payment: {
        payment_method: 'bank_transfer',
        reference_number: `m6-deposit-${randomUUID()}`,
      },
    },
    `m6-collect-${randomUUID()}`,
    context(),
  );
}

function schedulerConfig(): ConfigService {
  return {
    get<T>(key: string): T | undefined {
      if (key === 'app.env') return 'test' as T;
      if (key === 'lease.billingSchedulerProcessEnabled') return false as T;
      return undefined;
    },
  } as unknown as ConfigService;
}

async function main(): Promise<void> {
  const target = disposableDatabaseTargetFromEnv();
  const pool = new Pool(disposableDatabasePoolConfig(target));
  try {
    await assertDisposableDatabaseConnection(pool, target);
    if (process.env.NODE_ENV !== 'test')
      throw new Error('M6 disposable validator requires NODE_ENV=test');
    const data = await fixture(pool);
    const repository = new LeaseRepository({ client: pool } as unknown as DatabaseService);
    const leaseService = new LeaseService(repository);
    const features = new LeaseFeatureService(repository);
    const transfers = new LeaseTransferService(repository, features);
    const scheduler = new LeaseBillingScheduler(
      { client: pool } as unknown as DatabaseService,
      repository,
      features,
      schedulerConfig(),
    );

    const privateKtp = '1234567890123456';
    const transferCreated = await leaseService.create(
      data.owner,
      {
        property_id: data.propertyId,
        room_id: data.rooms[0],
        resident: { full_name: 'M6 Private Transfer Resident', ktp_number: privateKtp },
        start_date: jakartaToday(),
        billing_cycle: 'monthly',
        billing_anchor_day: 1,
      },
      `m6-transfer-create-${randomUUID()}`,
      context(),
    );
    const transferLeaseId = (transferCreated.body.data as { lease: { id: string } }).lease.id;
    await collectRequiredDeposit(leaseService, data.owner, transferLeaseId);

    const preview = await transfers.preview(data.admin, transferLeaseId, {
      target_room_id: data.rooms[1],
      effective_date: jakartaToday(),
    });
    const previewData = preview.data as {
      deposit: { top_up_required_amount: number };
      billing: { target_invoice_will_be_issued: boolean };
    };
    assert.equal(previewData.deposit.top_up_required_amount, 0);
    assert.equal(previewData.billing.target_invoice_will_be_issued, false);

    const transferDto = {
      target_room_id: data.rooms[1],
      effective_date: jakartaToday(),
      reason_code: 'property_operation' as const,
      reason_detail: 'Synthetic mid-cycle room change',
      exception_reason: 'Synthetic same-day validation run',
    };
    const replayKey = `m6-transfer-${randomUUID()}`;
    const transferred = await transfers.transfer(
      data.admin,
      transferLeaseId,
      transferDto,
      replayKey,
      context(),
    );
    assert.equal(transferred.replayed, false);
    const transferData = transferred.body.data as {
      source_lease: { id: string; lease_status: string; end_date: string };
      target_lease: { id: string; lease_status: string };
      transfer_record: { id: string; carried_deposit_amount: number };
      target_invoice: unknown;
    };
    assert.equal(transferData.source_lease.lease_status, 'transferred');
    assert.equal(transferData.source_lease.end_date, jakartaToday());
    assert.equal(transferData.target_lease.lease_status, 'active');
    assert.equal(transferData.target_invoice, null);
    assert.equal(transferData.transfer_record.carried_deposit_amount, STANDARD_DEPOSIT);

    const replay = await transfers.transfer(
      data.admin,
      transferLeaseId,
      transferDto,
      replayKey,
      context(),
    );
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, transferred.body);
    const transferLedger = await pool.query<{
      lease_id: string;
      direction: string;
      amount: string;
      transfer_record_id: string;
    }>(
      `SELECT lease_id, direction, amount, transfer_record_id
       FROM lease_deposit_transactions
       WHERE transfer_record_id = $1 ORDER BY direction`,
      [transferData.transfer_record.id],
    );
    assert.equal(transferLedger.rows.length, 2);
    assert.deepEqual(
      transferLedger.rows.map((row) => [row.direction, Number(row.amount)]),
      [
        ['credit', STANDARD_DEPOSIT],
        ['debit', STANDARD_DEPOSIT],
      ],
    );
    const transferSerialized = JSON.stringify(transferred.body);
    assert.equal(transferSerialized.includes(privateKtp), false);
    assert.equal(transferSerialized.includes('ktp_number'), false);
    const transferAuditAndOutbox = await pool.query<{ payload: string }>(
      `SELECT COALESCE(before_data::text, '') || COALESCE(after_data::text, '') AS payload
       FROM audit_logs WHERE resource_id = $1
       UNION ALL
       SELECT payload::text FROM business_events WHERE aggregate_id = $1`,
      [transferData.transfer_record.id],
    );
    assert.equal(
      transferAuditAndOutbox.rows.some(
        (row) => row.payload.includes(privateKtp) || row.payload.includes('ktp'),
      ),
      false,
    );

    const premiumLeaseId = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[3],
      data.residents[0],
    );
    await collectRequiredDeposit(leaseService, data.owner, premiumLeaseId);
    const premiumBefore = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM room_transfer_records WHERE from_lease_id = $1`,
      [premiumLeaseId],
    );
    await expectReject(
      () =>
        transfers.transfer(
          data.admin,
          premiumLeaseId,
          {
            target_room_id: data.rooms[2],
            effective_date: jakartaToday(),
            reason_code: 'commercial_adjustment',
            reason_detail: 'Invalid synthetic top-up',
            exception_reason: 'Synthetic same-day validation run',
            top_up: {
              amount: 1,
              payment: { payment_method: 'cash', reference_number: `m6-invalid-${randomUUID()}` },
            },
          },
          `m6-invalid-topup-${randomUUID()}`,
          context(),
        ),
      'TRANSFER_DEPOSIT_TOP_UP_AMOUNT_INVALID',
    );
    const premiumAfter = await pool.query<{ count: string; room_status: string }>(
      `SELECT
         (SELECT count(*) FROM room_transfer_records WHERE from_lease_id = $1)::text AS count,
         (SELECT room_status FROM rooms WHERE id = $2) AS room_status`,
      [premiumLeaseId, data.rooms[2]],
    );
    assert.equal(premiumAfter.rows[0].count, premiumBefore.rows[0].count);
    assert.equal(premiumAfter.rows[0].room_status, 'vacant');
    await expectReject(
      () =>
        transfers.transfer(
          data.owner,
          premiumLeaseId,
          {
            target_room_id: data.rooms[2],
            effective_date: jakartaToday(),
            reason_code: 'commercial_adjustment',
            reason_detail: 'Owner financial transfer denial',
            exception_reason: 'Synthetic same-day validation run',
            top_up: {
              amount: PREMIUM_DEPOSIT - STANDARD_DEPOSIT,
              payment: { payment_method: 'cash', reference_number: `m6-admin-${randomUUID()}` },
            },
          },
          `m6-admin-topup-${randomUUID()}`,
          context(),
        ),
      'TRANSFER_FINANCIAL_ACTOR_INVALID',
    );

    const concurrentOne = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[4],
      data.residents[1],
    );
    const concurrentTwo = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[5],
      data.residents[2],
    );
    await Promise.all([
      collectRequiredDeposit(leaseService, data.owner, concurrentOne),
      collectRequiredDeposit(leaseService, data.owner, concurrentTwo),
    ]);
    const contention = await Promise.allSettled([
      transfers.transfer(
        data.admin,
        concurrentOne,
        {
          target_room_id: data.rooms[6],
          effective_date: jakartaToday(),
          reason_code: 'resident_request',
          reason_detail: 'Concurrent synthetic transfer one',
          exception_reason: 'Synthetic same-day validation run',
        },
        `m6-contention-a-${randomUUID()}`,
        context(),
      ),
      transfers.transfer(
        data.admin,
        concurrentTwo,
        {
          target_room_id: data.rooms[6],
          effective_date: jakartaToday(),
          reason_code: 'resident_request',
          reason_detail: 'Concurrent synthetic transfer two',
          exception_reason: 'Synthetic same-day validation run',
        },
        `m6-contention-b-${randomUUID()}`,
        context(),
      ),
    ]);
    assert.equal(contention.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(contention.filter((entry) => entry.status === 'rejected').length, 1);
    const rejected = contention.find((entry) => entry.status === 'rejected');
    assert.equal(rejected?.status, 'rejected');
    if (rejected?.status === 'rejected')
      assert.equal(errorCode(rejected.reason), 'LEASE_ROOM_CONFLICT');

    const monthlyLease = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[7],
      data.residents[3],
    );
    const yearlyLease = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[8],
      data.residents[4],
    );
    await pool.query(
      `UPDATE leases
       SET billing_cycle = 'monthly', billing_anchor_day = 31, next_billing_date = '2024-01-31'::date
       WHERE id = $1`,
      [monthlyLease],
    );
    await pool.query(
      `UPDATE leases
       SET billing_cycle = 'yearly', billing_anchor_day = 29, next_billing_date = '2024-02-29'::date
       WHERE id = $1`,
      [yearlyLease],
    );
    const monthRun = await scheduler.runOnce({ businessDate: '2024-03-31' });
    assert.equal(monthRun.status, 'completed');
    const monthlyCycles = await pool.query<{ cycle_start_date: string }>(
      `SELECT cycle_start_date::text FROM invoices
       WHERE lease_id = $1 AND cycle_start_date IN ('2024-01-31'::date, '2024-02-29'::date, '2024-03-31'::date)
       ORDER BY cycle_start_date`,
      [monthlyLease],
    );
    assert.equal(monthlyCycles.rows.length, 3);
    await pool.query(`UPDATE leases SET next_billing_date = '2025-03-01'::date WHERE id = $1`, [
      monthlyLease,
    ]);
    const leapRun = await scheduler.runOnce({ businessDate: '2025-02-28' });
    assert.equal(leapRun.status, 'completed');
    const yearlyNext = await pool.query<{ next_billing_date: string }>(
      `SELECT next_billing_date::text FROM leases WHERE id = $1`,
      [yearlyLease],
    );
    assert.equal(yearlyNext.rows[0].next_billing_date, '2026-02-28');

    await pool.query(`UPDATE leases SET next_billing_date = '2025-02-28'::date WHERE id = $1`, [
      yearlyLease,
    ]);
    const beforeRetry = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM invoices WHERE lease_id = $1 AND cycle_start_date = '2025-02-28'::date`,
      [yearlyLease],
    );
    await scheduler.runOnce({ businessDate: '2025-02-28' });
    const afterRetry = await pool.query<{ count: string; next_billing_date: string }>(
      `SELECT
         (SELECT count(*) FROM invoices WHERE lease_id = $1 AND cycle_start_date = '2025-02-28'::date)::text AS count,
         (SELECT next_billing_date::text FROM leases WHERE id = $1) AS next_billing_date`,
      [yearlyLease],
    );
    assert.equal(afterRetry.rows[0].count, beforeRetry.rows[0].count);
    assert.equal(afterRetry.rows[0].next_billing_date, '2026-02-28');

    const multiInstanceLease = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[9],
      data.residents[5],
    );
    await pool.query(`UPDATE leases SET next_billing_date = '2025-03-01'::date WHERE id = $1`, [
      multiInstanceLease,
    ]);
    const schedulerTwo = new LeaseBillingScheduler(
      { client: pool } as unknown as DatabaseService,
      repository,
      features,
      schedulerConfig(),
    );
    const multiRuns = await Promise.all([
      scheduler.runOnce({ businessDate: '2025-03-01' }),
      schedulerTwo.runOnce({ businessDate: '2025-03-01' }),
    ]);
    assert.equal(
      multiRuns.every(
        (run) => run.status === 'completed' || run.status === 'skipped_advisory_lock',
      ),
      true,
    );
    const multiInvoice = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM invoices WHERE lease_id = $1 AND cycle_start_date = '2025-03-01'::date`,
      [multiInstanceLease],
    );
    assert.equal(Number(multiInvoice.rows[0].count), 1);

    const lockClient = await pool.connect();
    try {
      await lockClient.query(`SELECT pg_advisory_lock(hashtext('granada-lease-billing-v1'))`);
      const lockedRun = await scheduler.runOnce({ businessDate: '2025-03-01' });
      assert.equal(lockedRun.status, 'skipped_advisory_lock');
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext('granada-lease-billing-v1'))`);
      lockClient.release();
    }

    const catchUpLease = await createLease(
      leaseService,
      data.owner,
      data.propertyId,
      data.rooms[10],
      data.residents[6],
    );
    await pool.query(
      `UPDATE leases SET billing_anchor_day = 31, next_billing_date = '2023-01-31'::date WHERE id = $1`,
      [catchUpLease],
    );
    const catchUpRun = await scheduler.runOnce({ businessDate: '2025-03-01' });
    assert.equal(catchUpRun.catch_up_limited >= 1, true);
    const catchUpInvoices = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM invoices
       WHERE lease_id = $1 AND cycle_start_date >= '2023-01-31'::date
         AND cycle_start_date < '2024-01-31'::date`,
      [catchUpLease],
    );
    assert.equal(Number(catchUpInvoices.rows[0].count), 12);
    const catchUpEvent = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM business_events
       WHERE event_key = 'lease.billing_catchup_limit_reached:' || $1 || ':2025-03-01'`,
      [catchUpLease],
    );
    assert.equal(Number(catchUpEvent.rows[0].count), 1);
    const schedulerEffects = await pool.query<{ audits: string; invoices: string }>(
      "SELECT (SELECT count(*) FROM audit_logs WHERE action = 'lease.billing_scheduler')::text AS audits, (SELECT count(*) FROM business_events WHERE event_type = 'billing.invoice_issued')::text AS invoices",
    );
    assert.equal(Number(schedulerEffects.rows[0].audits) > 0, true);
    assert.equal(Number(schedulerEffects.rows[0].invoices) > 0, true);

    console.log(
      JSON.stringify({
        gate: 'admin-ux-m6-lease-transfer-scheduler-disposable',
        passed: true,
        target: sanitizedDisposableTarget(target),
        evidence: {
          transfer_mid_cycle_half_open: true,
          transfer_replay_idempotency: true,
          transfer_room_contention: true,
          transfer_rollback_atomic: true,
          transfer_financial_rbac: true,
          transfer_pii_sanitization: true,
          scheduler_month_end: true,
          scheduler_leap_year: true,
          scheduler_retry: true,
          scheduler_two_instance_advisory_lock: true,
          scheduler_catch_up_limit: true,
          scheduler_outbox_and_audit: true,
        },
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'M6 lease lifecycle validation failed';
  console.error(`M6 lease lifecycle validation failed: ${message}`);
  process.exitCode = 1;
});
