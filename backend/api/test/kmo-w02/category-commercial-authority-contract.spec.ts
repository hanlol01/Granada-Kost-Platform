import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationPipe } from '@nestjs/common';
import {
  CreateKostTypeDto,
  UpdateKostTypeDto,
} from '../../src/modules/admin-ux-master/admin-ux-master.dto';
import { AdminUxMasterService } from '../../src/modules/admin-ux-master/admin-ux-master.service';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { RoomController } from '../../src/modules/room/room.controller';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migrationPath =
  'backend/api/src/infrastructure/database/migrations/022_kost_type_commercial_authority.sql';
const propertyId = '11111111-1111-4111-8111-111111111111';
const kostTypeId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function errorHasCode(error: unknown, code: string): boolean {
  return JSON.stringify(error).includes(code);
}

function assertQualifiedAliasesResolve(sql: string): void {
  const insert = /INSERT INTO kost_type_commercial_versions[\s\S]+?ON CONFLICT/i.exec(sql)?.[0];
  assert.ok(insert, 'commercial authority INSERT must exist');
  const aliases = new Set(
    [...insert.matchAll(/\b(?:FROM|JOIN)\s+[a-z_][a-z0-9_]*\s+([a-z_][a-z0-9_]*)/gi)].map((match) =>
      match[1]!.toLowerCase(),
    ),
  );
  for (const keyword of ['where', 'on', 'group', 'order', 'left', 'right', 'inner', 'outer']) {
    aliases.delete(keyword);
  }
  const qualified = new Set(
    [...insert.matchAll(/\b([a-z_][a-z0-9_]*)\s*\./gi)].map((match) => match[1]!),
  );
  for (const alias of qualified) {
    assert.ok(aliases.has(alias), `unresolved SQL alias: ${alias}`);
  }
}

test('migration 022 establishes the fixed, effective-dated category authority', () => {
  const migration = source(migrationPath);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kost_type_commercial_versions/);
  assert.match(migration, /monthly_price BIGINT NOT NULL/);
  assert.match(migration, /annual_contract_value BIGINT NOT NULL/);
  assert.match(migration, /minimum_dp_percent SMALLINT NOT NULL DEFAULT 25/);
  assert.match(migration, /minimum_dp_percent = 25/);
  assert.match(migration, /security_deposit_months SMALLINT NOT NULL DEFAULT 1/);
  assert.match(migration, /1800000,\s*\n\s*21600000,/);
  assert.match(migration, /UNIQUE \(kost_type_id, effective_date\)/);
  assert.match(migration, /W02B_CATEGORY_AUTHORITY_NOT_EXACTLY_TWO/);
  assert.doesNotMatch(migration, /UPDATE\s+rooms/i);
  assertQualifiedAliasesResolve(migration);
  assert.throws(
    () =>
      assertQualifiedAliasesResolve(
        migration.replaceAll('FROM kost_types kost_type', 'FROM kost_types'),
      ),
    /unresolved SQL alias: kost_type/,
  );

  const checksum = createHash('sha256')
    .update(readFileSync(resolve(process.cwd(), migrationPath)))
    .digest('hex');
  const manifest = source('backend/api/src/infrastructure/database/scripts/migration-manifest.ts');
  assert.match(manifest, /version: '022_kost_type_commercial_authority\.sql'/);
  assert.match(manifest, new RegExp(`checksumSha256: '${checksum}'`));
});

void test(
  'migration 022 first apply and immediate replay converge in disposable PostgreSQL',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const dataDirectory = mkdtempSync(join(tmpdir(), 'kostation-w02b-pg-'));
    try {
      const initialized = spawnSync(
        join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
        ['-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(initialized.status, 0, 'disposable PostgreSQL initialization failed');

      const migration = source(migrationPath);
      const proof = `
        CREATE TABLE users (id UUID PRIMARY KEY);
        CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL);
        CREATE TABLE kost_types (
          id UUID PRIMARY KEY,
          property_id UUID NOT NULL REFERENCES properties(id),
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          deleted_at TIMESTAMPTZ,
          created_by_user_id UUID REFERENCES users(id),
          updated_by_user_id UUID REFERENCES users(id)
        );
        INSERT INTO properties (id, status) VALUES ('${propertyId}', 'active');
        INSERT INTO kost_types (id, property_id, category, status)
        VALUES
          ('${kostTypeId}', '${propertyId}', 'rukost', 'active'),
          ('44444444-4444-4444-8444-444444444444', '${propertyId}', 'apartkost', 'active');
        ${migration}
        ${migration}
        DO $proof$
        BEGIN
          IF (
            SELECT COUNT(*)
            FROM kost_type_commercial_versions
          ) <> 2 THEN
            RAISE EXCEPTION 'W02B_REPLAY_DID_NOT_CONVERGE';
          END IF;
          IF EXISTS (
            SELECT 1
            FROM kost_type_commercial_versions
            WHERE monthly_price <> 1800000
               OR annual_contract_value <> 21600000
               OR minimum_dp_percent <> 25
               OR security_deposit_months <> 1
          ) THEN
            RAISE EXCEPTION 'W02B_COMMERCIAL_POLICY_MISMATCH';
          END IF;
        END
        $proof$;
      `;
      const executed = spawnSync(
        join(bin, process.platform === 'win32' ? 'postgres.exe' : 'postgres'),
        ['--single', '-D', dataDirectory, 'postgres'],
        {
          input: proof,
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      assert.equal(executed.status, 0, 'disposable migration execution failed');
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  },
);

test('commercial DTO validation is strict and rejects raw deposit authority', async () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
  });
  const valid = {
    property_id: propertyId,
    category: 'rukost',
    name: 'Rumah Kost',
    slug: 'rumah-kost',
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    effective_date: '2026-08-01',
    payment_schedules: ['annual', 'two_month_installments'],
    security_deposit_months: 1,
  };
  await assert.doesNotReject(() =>
    pipe.transform(valid, { type: 'body', metatype: CreateKostTypeDto }),
  );
  await assert.rejects(() =>
    pipe.transform(
      { ...valid, monthly_price: '1800000' },
      {
        type: 'body',
        metatype: CreateKostTypeDto,
      },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      { ...valid, minimum_dp_percent: 25 },
      {
        type: 'body',
        metatype: CreateKostTypeDto,
      },
    ),
  );
  await assert.doesNotReject(() =>
    pipe.transform(
      {
        property_id: valid.property_id,
        monthly_price: valid.monthly_price,
        yearly_price: valid.yearly_price,
        effective_date: valid.effective_date,
      },
      { type: 'body', metatype: UpdateKostTypeDto },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      {
        monthly_price: valid.monthly_price,
        yearly_price: valid.yearly_price,
        effective_date: valid.effective_date,
      },
      { type: 'body', metatype: UpdateKostTypeDto },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      { ...valid, deposit_amount: 1_000_000 },
      {
        type: 'body',
        metatype: CreateKostTypeDto,
      },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      { ...valid, name: '   ' },
      {
        type: 'body',
        metatype: CreateKostTypeDto,
      },
    ),
  );
});

test('pure commercial validation separates DP, deposit, and schedules', () => {
  const service = new AdminUxMasterService({} as never, {} as never, {} as never) as unknown as {
    validateCommercialInput: (input: Record<string, unknown>) => {
      monthlyPrice: number;
      annualContractValue: number;
      minimumDpPercent: number;
      securityDepositMonths: number;
      paymentSchedules: string[];
    };
    effectiveDate: (value?: string) => string;
    requestFingerprint: (value: unknown) => string;
    rethrowKostTypeConflict: (error: unknown) => never;
  };
  const value = service.validateCommercialInput({
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    security_deposit_months: 1,
    payment_schedules: ['annual', 'two_month_installments'],
  });
  assert.deepEqual(value, {
    monthlyPrice: 1_800_000,
    annualContractValue: 21_600_000,
    minimumDpPercent: 25,
    securityDepositMonths: 1,
    paymentSchedules: ['annual', 'two_month_installments'],
  });
  assert.equal(service.effectiveDate('2026-08-01'), '2026-08-01');
  assert.throws(() => service.effectiveDate('2026-08-01T00:00:00Z'));
  assert.throws(() =>
    service.validateCommercialInput({
      monthly_price: 1_800_000,
      yearly_price: 21_600_000,
      payment_schedules: ['annual', 'annual'],
    }),
  );
  assert.equal(
    service.requestFingerprint({ yearly_price: 21_600_000, monthly_price: 1_800_000 }),
    service.requestFingerprint({ monthly_price: 1_800_000, yearly_price: 21_600_000 }),
  );
  assert.throws(
    () =>
      service.rethrowKostTypeConflict({
        code: '23505',
        constraint: 'kost_type_commercial_versions_unique_effective',
      }),
    (error: unknown) => JSON.stringify(error).includes('KOST_TYPE_EFFECTIVE_DATE_CONFLICT'),
  );
});

test('category create rejects non-baseline initial rates before database access', async () => {
  let databaseAccessed = false;
  const service = new AdminUxMasterService(
    {
      client: {
        connect: async () => {
          databaseAccessed = true;
          throw new Error('unexpected database access');
        },
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );
  await assert.rejects(
    () =>
      service.createKostType(
        {
          id: '33333333-3333-4333-8333-333333333333',
          roles: ['admin'],
          propertyIds: ['22222222-2222-4222-8222-222222222222'],
        } as never,
        {
          property_id: '22222222-2222-4222-8222-222222222222',
          category: 'rukost',
          name: 'Rumah Kost',
          slug: 'rumah-kost',
          monthly_price: 1_900_000,
          yearly_price: 21_600_000,
          effective_date: '2026-07-31',
          payment_schedules: ['annual'],
          security_deposit_months: 1,
        },
        {} as never,
        'w02b-initial-rate',
      ),
    (error: unknown) => JSON.stringify(error).includes('KOST_TYPE_INITIAL_RATE_INVALID'),
  );
  await assert.rejects(() =>
    service.createKostType(
      {
        id: '33333333-3333-4333-8333-333333333333',
        roles: ['admin'],
        propertyIds: ['22222222-2222-4222-8222-222222222222'],
      } as never,
      {
        property_id: '22222222-2222-4222-8222-222222222222',
        category: 'rukost',
        name: 'Rumah Kost',
        slug: 'rumah-kost',
        monthly_price: '1800000',
        yearly_price: 21_600_000,
        effective_date: '2026-07-31',
      },
      {} as never,
      'w02b-string-rate',
    ),
  );
  assert.equal(databaseAccessed, false);
});

function updateBody(effectiveDate: string) {
  return {
    property_id: propertyId,
    monthly_price: 1_900_000,
    yearly_price: 22_800_000,
    effective_date: effectiveDate,
    payment_schedules: ['annual'],
    security_deposit_months: 1,
  };
}

function lockedKostType() {
  return {
    id: kostTypeId,
    property_id: propertyId,
    category: 'rukost',
    name: 'Rumah Kost',
    slug: 'rumah-kost',
    description_short: null,
    description_long: null,
    room_size_label: '3 x 4 m',
    room_size_m2: 12,
    monthly_price: 1_800_000,
    yearly_price: 21_600_000,
    deposit_amount: 1_800_000,
    max_occupants: 1,
    public_visible: true,
    notes: null,
    status: 'active',
    deleted_at: null,
    created_at: new Date('2026-07-01T00:00:00.000Z'),
    updated_at: new Date('2026-07-01T00:00:00.000Z'),
  };
}

function currentVersion() {
  return {
    effective_date: '2026-07-01',
    monthly_price: 1_800_000,
    annual_contract_value: 21_600_000,
    minimum_dp_percent: 25,
    security_deposit_months: 1,
    payment_schedules: ['annual', 'two_month_installments'],
  };
}

function updateHarness(
  options: { future?: boolean; auditFails?: boolean; driverReturnsDates?: boolean } = {},
) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM kost_types') && sql.includes('FOR UPDATE')) {
        return { rows: [lockedKostType()] };
      }
      if (sql.includes('INSERT INTO idempotency_commands')) {
        return { rows: [{ request_fingerprint: 'new', command_status: 'pending' }] };
      }
      if (sql.includes("AT TIME ZONE 'Asia/Jakarta'")) {
        return { rows: [{ today: '2026-07-31' }] };
      }
      if (sql.includes('FROM kost_type_commercial_versions') && sql.includes('FOR UPDATE')) {
        const returnsIsoText = sql.includes('effective_date::text AS effective_date');
        const effectiveDate =
          options.driverReturnsDates && !returnsIsoText
            ? new Date('2026-07-01T00:00:00+07:00')
            : '2026-07-01';
        const futureEffectiveDate =
          options.driverReturnsDates && !returnsIsoText
            ? new Date('2026-08-15T00:00:00+07:00')
            : '2026-08-15';
        return {
          rows: [
            { ...currentVersion(), effective_date: effectiveDate },
            ...(options.future
              ? [{ ...currentVersion(), effective_date: futureEffectiveDate }]
              : []),
          ],
        };
      }
      if (/^\s*UPDATE kost_types/.test(sql)) {
        return {
          rows: [{ ...lockedKostType(), updated_at: new Date('2026-07-31T00:00:00.000Z') }],
        };
      }
      if (/^\s*UPDATE kost_type_commercial_versions/.test(sql)) return { rows: [] };
      if (sql.includes('INSERT INTO kost_type_commercial_versions')) return { rows: [] };
      if (
        sql.includes('FROM kost_type_commercial_versions') &&
        sql.includes('effective_date <= CURRENT_DATE')
      ) {
        return { rows: [currentVersion()] };
      }
      if (
        sql.includes('FROM kost_type_commercial_versions') &&
        sql.includes('effective_date > CURRENT_DATE')
      ) {
        return { rows: [{ ...currentVersion(), effective_date: '2026-08-01' }] };
      }
      if (sql.includes('FROM kost_type_facility_assignments')) return { rows: [] };
      if (sql.includes('FROM kost_type_rules')) return { rows: [] };
      if (sql.includes('UPDATE idempotency_commands')) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
    release: () => undefined,
  };
  let rootQueryCount = 0;
  const database = {
    client: {
      connect: async () => client,
      query: async () => {
        rootQueryCount += 1;
        throw new Error('pool query bypassed transaction client');
      },
    },
  };
  const auditClients: unknown[] = [];
  const service = new AdminUxMasterService(
    database as never,
    { assertCanReadProperty: async () => undefined } as never,
    {
      write: async (_entry: unknown, auditClient: unknown) => {
        auditClients.push(auditClient);
        if (options.auditFails) throw new Error('synthetic audit failure');
      },
    } as never,
  );
  return { service, client, calls, auditClients, rootQueryCount: () => rootQueryCount };
}

test('commercial update authorizes before lookup or idempotency', async () => {
  let connected = false;
  const service = new AdminUxMasterService(
    {
      client: {
        connect: async () => {
          connected = true;
          throw new Error('database must not be reached');
        },
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new Error('property denied');
      },
    } as never,
    {} as never,
  );
  await assert.rejects(
    () =>
      service.updateKostType(
        { id: actorId, roles: ['admin'], propertyIds: [] } as never,
        kostTypeId,
        updateBody('2026-08-01'),
        {} as never,
        'auth-order',
      ),
    /property denied/,
  );
  assert.equal(connected, false);
});

test('commercial update uses database date and rejects today or past before write', async () => {
  for (const effectiveDate of ['2026-07-31', '2026-07-30']) {
    const harness = updateHarness();
    await assert.rejects(
      () =>
        harness.service.updateKostType(
          { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
          kostTypeId,
          updateBody(effectiveDate),
          {} as never,
          `date-${effectiveDate}`,
        ),
      (error: unknown) => errorHasCode(error, 'KOST_TYPE_EFFECTIVE_DATE_NOT_FUTURE'),
    );
    assert.equal(harness.rootQueryCount(), 0);
    assert.equal(
      harness.calls.some(({ sql }) => /^\s*UPDATE kost_types/.test(sql)),
      false,
    );
    assert.match(
      harness.calls.find(({ sql }) => sql.includes('FROM kost_types'))!.sql,
      /FOR UPDATE/,
    );
    assert.match(
      harness.calls.find(
        ({ sql }) =>
          sql.includes('FROM kost_type_commercial_versions') && sql.includes('FOR UPDATE'),
      )!.sql,
      /ORDER BY effective_date, id[\s\S]*FOR UPDATE/,
    );
    assert.equal(harness.calls.at(-1)!.sql, 'ROLLBACK');
  }
});

test('commercial update fails closed when a future version is already locked', async () => {
  const harness = updateHarness({ future: true });
  await assert.rejects(
    () =>
      harness.service.updateKostType(
        { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
        kostTypeId,
        updateBody('2026-09-01'),
        {} as never,
        'future-conflict',
      ),
    (error: unknown) => errorHasCode(error, 'KOST_TYPE_FUTURE_COMMERCIAL_CONFLICT'),
  );
  assert.equal(
    harness.calls.some(({ sql }) => /^\s*UPDATE kost_types/.test(sql)),
    false,
  );
  assert.equal(harness.auditClients.length, 0);
  assert.equal(harness.rootQueryCount(), 0);
});

test('commercial update can revise the already scheduled effective date', async () => {
  const harness = updateHarness({ future: true });
  const response = await harness.service.updateKostType(
    { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
    kostTypeId,
    updateBody('2026-08-15'),
    {} as never,
    'future-revise',
  );

  assert.equal(response.data.property_id, propertyId);
  assert.equal(
    harness.calls.some(({ sql }) => /UPDATE kost_type_commercial_versions/.test(sql)),
    true,
  );
  assert.equal(
    harness.calls.some(({ sql }) => sql.includes('INSERT INTO kost_type_commercial_versions')),
    false,
  );
});

test('commercial update compares locked PostgreSQL dates as canonical ISO text', async () => {
  const harness = updateHarness({ future: true, driverReturnsDates: true });
  const response = await harness.service.updateKostType(
    { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
    kostTypeId,
    updateBody('2026-08-15'),
    {} as never,
    'postgres-date-normalization',
  );

  assert.equal(response.data.property_id, propertyId);
  assert.match(
    harness.calls.find(
      ({ sql }) => sql.includes('FROM kost_type_commercial_versions') && sql.includes('FOR UPDATE'),
    )!.sql,
    /effective_date::text AS effective_date/,
  );
});

test('commercial update keeps future rate, audit, and command completion atomic', async () => {
  const harness = updateHarness();
  const response = await harness.service.updateKostType(
    { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
    kostTypeId,
    updateBody('2026-08-01'),
    {} as never,
    'atomic-success',
  );
  assert.equal(response.data.property_id, propertyId);
  assert.equal(harness.auditClients.length, 1);
  assert.equal(harness.auditClients[0], harness.client);
  assert.equal(harness.rootQueryCount(), 0);
  assert.equal(harness.calls.at(-1)!.sql, 'COMMIT');
  assert.equal(
    harness.calls.some(
      ({ sql }) =>
        /^\s*UPDATE kost_types/.test(sql) &&
        /\b(monthly_price|yearly_price|deposit_amount)\s*=/.test(sql),
    ),
    false,
  );
  assert.equal(
    harness.calls.some(({ sql }) => sql.includes('UPDATE idempotency_commands')),
    true,
  );

  const auditFailure = updateHarness({ auditFails: true });
  await assert.rejects(
    () =>
      auditFailure.service.updateKostType(
        { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never,
        kostTypeId,
        updateBody('2026-08-01'),
        {} as never,
        'atomic-failure',
      ),
    /synthetic audit failure/,
  );
  assert.equal(auditFailure.calls.at(-1)!.sql, 'ROLLBACK');
  assert.equal(
    auditFailure.calls.some(({ sql }) => sql.includes('UPDATE idempotency_commands')),
    false,
  );
});

test('legacy room updates also reject category-owned commercial fields', () => {
  const controller = new RoomController({} as never, {} as never, {} as never) as unknown as {
    assertNoCommercialOverride: (dto: Record<string, unknown>) => void;
  };
  assert.doesNotThrow(() =>
    controller.assertNoCommercialOverride({ number: 'RK-01-01', notes: 'safe physical note' }),
  );
  for (const field of ['monthly_price', 'yearly_price', 'deposit_amount', 'facility_ids']) {
    assert.throws(
      () => controller.assertNoCommercialOverride({ [field]: field === 'facility_ids' ? [] : 1 }),
      (error: unknown) => JSON.stringify(error).includes('IMMUTABLE_ROOM_COMMERCIAL_FIELD'),
    );
  }

  const v2 = new AdminUxRoomV2Service({} as never, {} as never, {} as never) as unknown as {
    assertNoCommercialFields: (dto: Record<string, unknown>) => void;
  };
  for (const field of [
    'monthly_price',
    'yearly_price',
    'deposit_amount',
    'facility_ids',
    'monthlyPrice',
    'yearlyPrice',
    'depositAmount',
    'facilityIds',
    'minimum_dp_percent',
    'minimumDpPercent',
    'payment_schedules',
    'paymentSchedules',
    'security_deposit_months',
    'securityDepositMonths',
  ]) {
    assert.throws(
      () => v2.assertNoCommercialFields({ [field]: field.includes('facilit') ? [] : 1 }),
      (error: unknown) => errorHasCode(error, 'IMMUTABLE_ROOM_COMMERCIAL_FIELD'),
    );
  }
});

test('live production paths use category versions and preserve lease snapshots', () => {
  const master = source('backend/api/src/modules/admin-ux-master/admin-ux-master.service.ts');
  const rooms = source('backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts');
  const detail = source('backend/api/src/modules/admin-ux-master/admin-ux-room-detail.service.ts');
  const controller = source(
    'backend/api/src/modules/admin-ux-master/admin-ux-master.controller.ts',
  );
  const lease = source('backend/api/src/modules/lease/lease.service.ts');
  const transfer = source('backend/api/src/modules/lease/lease-transfer.service.ts');
  const publicRooms = source('backend/api/src/modules/room/repositories/room.repository.ts');
  const roomController = source('backend/api/src/modules/room/room.controller.ts');

  for (const text of [master, rooms, detail, lease, transfer, publicRooms]) {
    assert.match(text, /kost_type_commercial_versions/);
  }
  assert.doesNotMatch(master, /syncLegacyRoomSnapshots/);
  assert.doesNotMatch(master, /UPDATE rooms/);
  assert.match(rooms, /IMMUTABLE_ROOM_COMMERCIAL_FIELD/);
  const roomById = rooms.slice(
    rooms.indexOf('private async roomById'),
    rooms.indexOf('private async mapRooms', rooms.indexOf('private async roomById')),
  );
  const assertRoomTuple = (text: string) => {
    assert.match(text, /kost_type\.property_id = room\.property_id/);
    assert.match(text, /kost_type\.category = room\.category/);
    assert.match(text, /kost_type\.deleted_at IS NULL/);
    assert.match(text, /building\.property_id = room\.property_id/);
  };
  assertRoomTuple(roomById);
  for (const mutation of [
    roomById.replace('AND kost_type.property_id = room.property_id', ''),
    roomById.replace('AND kost_type.category = room.category', ''),
    roomById.replace('AND kost_type.deleted_at IS NULL', ''),
    roomById.replace('AND building.property_id = room.property_id', ''),
  ]) {
    assert.throws(() => assertRoomTuple(mutation));
  }
  assert.match(roomController, /assertNoCommercialOverride\(legacyDto\)/);
  assert.match(controller, /@Headers\('idempotency-key'\)/);
  assert.match(master, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(master, /KOST_TYPE_EFFECTIVE_DATE_CONFLICT/);
  assert.doesNotMatch(
    master.slice(
      master.indexOf(
        'INSERT INTO kost_type_commercial_versions',
        master.indexOf('async updateKostType'),
      ),
      master.indexOf('await this.audit.write', master.indexOf('async updateKostType')),
    ),
    /ON CONFLICT/,
  );
  assert.match(master, /KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED/);
  assert.match(lease, /snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount/);
  assert.doesNotMatch(lease, /UPDATE leases\s+SET\s+[^`]*snapshot_monthly_price/i);
  const publicAvailability = publicRooms.slice(
    publicRooms.indexOf('async listPublicAvailabilityGroups'),
    publicRooms.indexOf('private async replaceFacilities'),
  );
  assert.match(publicAvailability, /commercial_version\.monthly_price/);
  assert.doesNotMatch(publicAvailability, /min\(rooms\.(monthly_price|yearly_price)/);
  const legacyReadStart = publicRooms.indexOf('async listRooms');
  const legacyReads = publicRooms.slice(
    legacyReadStart,
    publicRooms.indexOf('async createRoom(', legacyReadStart),
  );
  assert.match(legacyReads, /commercial_version\.annual_contract_value/);
  assert.doesNotMatch(legacyReads, /rooms\.(monthly_price|deposit_amount|yearly_price)/);
});
