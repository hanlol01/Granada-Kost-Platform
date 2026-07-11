import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { LeaseRepository } from '../../../modules/lease/lease.repository';
import { LeaseService } from '../../../modules/lease/lease.service';
import type { UserAccessContext } from '../../../modules/iam/types/iam.types';
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
  roomOne: string;
  roomTwo: string;
  residentOne: string;
  residentTwo: string;
};

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
    displayName: `M5 ${role}`,
    roles: [role],
    permissions:
      role === 'owner'
        ? ['lease.read', 'lease.manage', 'billing.manage']
        : ['lease.read', 'lease.manage'],
    propertyIds: [propertyId],
    sessionId: randomUUID(),
  };
}

async function fixture(pool: Pool): Promise<Fixture> {
  const suffix = randomUUID().replaceAll('-', '');
  const ownerId = randomUUID();
  const adminId = randomUUID();
  const propertyId = randomUUID();
  const kostTypeId = randomUUID();
  const roomOne = randomUUID();
  const roomTwo = randomUUID();
  const residentOne = randomUUID();
  const residentTwo = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name)
     VALUES ($1, $2, 'm5-fixture', 'M5 Owner'), ($3, $4, 'm5-fixture', 'M5 Admin')`,
    [ownerId, `m5-owner-${suffix}@example.invalid`, adminId, `m5-admin-${suffix}@example.invalid`],
  );
  await pool.query(
    `INSERT INTO properties (id, name, address, timezone, status, created_by_user_id, updated_by_user_id)
     VALUES ($1, 'M5 Disposable Fixture', 'Synthetic only', 'Asia/Jakarta', 'active', $2, $2)`,
    [propertyId, ownerId],
  );
  await pool.query(`INSERT INTO property_settings (property_id, default_due_day) VALUES ($1, 25)`, [
    propertyId,
  ]);
  await pool.query(
    `INSERT INTO kost_types (
       id, property_id, category, name, slug, monthly_price, yearly_price, deposit_amount,
       status, created_by_user_id, updated_by_user_id
     ) VALUES ($1, $2, 'rukost', 'M5 Fixture Type', $3, 1000000, 12000000, 250000, 'active', $4, $4)`,
    [kostTypeId, propertyId, `m5-${suffix}`, ownerId],
  );
  await pool.query(
    `INSERT INTO rooms (
       id, property_id, number, category, monthly_price, deposit_amount, room_status, kost_type_id,
       created_by_user_id, updated_by_user_id
     ) VALUES
       ($1, $2, $3, 'rukost', 1000000, 250000, 'vacant', $4, $5, $5),
       ($6, $2, $7, 'rukost', 1000000, 250000, 'vacant', $4, $5, $5)`,
    [
      roomOne,
      propertyId,
      `M5-A-${suffix.slice(0, 8)}`,
      kostTypeId,
      ownerId,
      roomTwo,
      `M5-B-${suffix.slice(0, 8)}`,
    ],
  );
  await pool.query(
    `INSERT INTO residents (id, property_id, full_name, resident_status, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, 'M5 Resident One', 'active', $3, $3), ($4, $2, 'M5 Resident Two', 'active', $3, $3)`,
    [residentOne, propertyId, ownerId, residentTwo],
  );
  return {
    propertyId,
    owner: actor(ownerId, 'owner', propertyId),
    admin: actor(adminId, 'admin', propertyId),
    roomOne,
    roomTwo,
    residentOne,
    residentTwo,
  };
}

function commandContext() {
  return {
    correlationId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'admin-ux-m5-disposable',
  };
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: unknown }).response;
    if (response && typeof response === 'object' && 'code' in response)
      return String(response.code);
  }
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  return undefined;
}

async function expectReject(work: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => errorCode(error) === code);
}

async function main(): Promise<void> {
  const target = disposableDatabaseTargetFromEnv();
  const pool = new Pool(disposableDatabasePoolConfig(target));
  try {
    await assertDisposableDatabaseConnection(pool, target);
    const data = await fixture(pool);
    const service = new LeaseService(
      new LeaseRepository({ client: pool } as unknown as DatabaseService),
    );
    const today = jakartaToday();
    const privateKtp = '1234567890123456';
    const createPayload = {
      property_id: data.propertyId,
      room_id: data.roomOne,
      resident: { full_name: 'M5 Private Resident', ktp_number: privateKtp },
      start_date: today,
      billing_cycle: 'monthly' as const,
      notes: 'Synthetic lifecycle fixture',
    };
    const replayKey = `m5-create-${randomUUID()}`;
    const created = await service.create(data.owner, createPayload, replayKey, commandContext());
    assert.equal(created.replayed, false);
    const createdData = created.body.data as {
      lease: { id: string };
      occupancy: { occupancy_status: string };
      first_invoice: { invoice_status: string };
    };
    assert.equal(createdData.occupancy.occupancy_status, 'active');
    assert.equal(createdData.first_invoice.invoice_status, 'issued');

    const replay = await service.create(data.owner, createPayload, replayKey, commandContext());
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, created.body);
    await expectReject(
      () =>
        service.create(
          data.owner,
          { ...createPayload, notes: 'different replay payload' },
          replayKey,
          commandContext(),
        ),
      'IDEMPOTENCY_KEY_REUSED',
    );

    const occupancyCount = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM occupancies WHERE room_id = $1 AND occupancy_status = 'active'`,
      [data.roomOne],
    );
    const invoiceCount = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM invoices WHERE lease_id = $1`,
      [createdData.lease.id],
    );
    const roomStatus = await pool.query<{ room_status: string }>(
      `SELECT room_status FROM rooms WHERE id = $1`,
      [data.roomOne],
    );
    assert.equal(Number(occupancyCount.rows[0].count), 1);
    assert.equal(Number(invoiceCount.rows[0].count), 1);
    assert.equal(roomStatus.rows[0].room_status, 'occupied');

    const concurrentPayload = {
      property_id: data.propertyId,
      room_id: data.roomTwo,
      resident_id: data.residentTwo,
      start_date: today,
      billing_cycle: 'monthly' as const,
    };
    const concurrent = await Promise.allSettled([
      service.create(
        data.owner,
        concurrentPayload,
        `m5-concurrent-a-${randomUUID()}`,
        commandContext(),
      ),
      service.create(
        data.owner,
        concurrentPayload,
        `m5-concurrent-b-${randomUUID()}`,
        commandContext(),
      ),
    ]);
    assert.equal(concurrent.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((entry) => entry.status === 'rejected').length, 1);

    const ledgerBeforeRbac = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM lease_deposit_transactions WHERE lease_id = $1`,
      [createdData.lease.id],
    );
    await expectReject(
      () =>
        service.collectDeposit(
          data.admin,
          createdData.lease.id,
          { transaction_type: 'collection', amount: 100000, override_reason: 'not authorized' },
          `m5-admin-financial-${randomUUID()}`,
          commandContext(),
        ),
      'FORBIDDEN',
    );
    const ledgerAfterRbac = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM lease_deposit_transactions WHERE lease_id = $1`,
      [createdData.lease.id],
    );
    assert.equal(ledgerAfterRbac.rows[0].count, ledgerBeforeRbac.rows[0].count);

    await service.collectDeposit(
      data.owner,
      createdData.lease.id,
      {
        transaction_type: 'collection',
        amount: 100000,
        payment: { payment_method: 'bank_transfer', reference_number: `m5-ref-${randomUUID()}` },
      },
      `m5-collect-${randomUUID()}`,
      commandContext(),
    );
    const ledgerBeforeRollback = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM lease_deposit_transactions WHERE lease_id = $1`,
      [createdData.lease.id],
    );
    const duplicateCode = `M5-DUP-${randomUUID().slice(0, 8)}`;
    await service.collectDeposit(
      data.owner,
      createdData.lease.id,
      {
        transaction_type: 'collection',
        amount: 100000,
        payment: {
          payment_method: 'cash',
          payment_code: duplicateCode,
          reference_number: `m5-ref-${randomUUID()}`,
        },
      },
      `m5-dup-first-${randomUUID()}`,
      commandContext(),
    );
    await expectReject(
      () =>
        service.collectDeposit(
          data.owner,
          createdData.lease.id,
          {
            transaction_type: 'collection',
            amount: 10000,
            payment: {
              payment_method: 'cash',
              payment_code: duplicateCode,
              reference_number: `m5-ref-${randomUUID()}`,
            },
          },
          `m5-dup-second-${randomUUID()}`,
          commandContext(),
        ),
      '23505',
    );
    const ledgerAfterRollback = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM lease_deposit_transactions WHERE lease_id = $1`,
      [createdData.lease.id],
    );
    assert.equal(
      Number(ledgerAfterRollback.rows[0].count),
      Number(ledgerBeforeRollback.rows[0].count) + 1,
    );

    const detail = await service.get(data.owner, createdData.lease.id);
    const serialized = JSON.stringify(detail);
    assert.equal(serialized.includes('ktp_number'), false);
    assert.equal(serialized.includes(privateKtp), false);
    assert.equal(serialized.includes('storage_path'), false);
    const auditPayloads = await pool.query<{ payload: string }>(
      `SELECT COALESCE(before_data::text, '') || COALESCE(after_data::text, '') AS payload
       FROM audit_logs WHERE resource_id = $1`,
      [createdData.lease.id],
    );
    const eventPayloads = await pool.query<{ payload: string }>(
      `SELECT payload::text AS payload FROM business_events WHERE aggregate_id = $1`,
      [createdData.lease.id],
    );
    assert.equal(
      [...auditPayloads.rows, ...eventPayloads.rows].some((row) => row.payload.includes('ktp')),
      false,
    );

    console.log(
      JSON.stringify({
        gate: 'admin-ux-m5-lease-lifecycle-disposable',
        passed: true,
        target: sanitizedDisposableTarget(target),
        evidence: {
          idempotency_replay: true,
          concurrent_room_conflict: true,
          atomic_rollback: true,
          financial_rbac: true,
          pii_sanitization: true,
          first_invoice_issued: true,
        },
      }),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'M5 lease lifecycle validation failed';
  console.error(`M5 lease lifecycle validation failed: ${message}`);
  process.exitCode = 1;
});
