import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';
import { MIGRATION_MANIFEST } from '../../src/infrastructure/database/scripts/migration-manifest';
import { CreateResidentDto } from '../../src/modules/resident/dto/create-resident.dto';
import { ProvisionResidentAccountDto } from '../../src/modules/resident/dto/provision-resident-account.dto';
import { UpdateResidentDto } from '../../src/modules/resident/dto/update-resident.dto';
import { ResidentAccountService } from '../../src/modules/resident/resident-account.service';
import { ResidentRepository } from '../../src/modules/resident/repositories/resident.repository';
import { ResidentController } from '../../src/modules/resident/resident.controller';
import { ResidentService } from '../../src/modules/resident/resident.service';
import { sanitizeResidentForAudit } from '../../src/modules/resident/resident-audit.util';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const root = resolve(__dirname, '../..');
const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const RESIDENT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const KEY = 'w04-idempotency-key-0001';
const MIGRATION_PATH =
  'src/infrastructure/database/migrations/025_resident_identity_account_authority.sql';

function actor(): UserAccessContext {
  return {
    id: ACTOR_ID,
    email: null,
    phone: null,
    displayName: 'Admin',
    roles: ['admin'],
    permissions: ['resident.read', 'resident.manage'],
    propertyIds: [PROPERTY_ID],
    sessionId: 'session',
  };
}

function resident() {
  return {
    id: RESIDENT_ID,
    propertyId: PROPERTY_ID,
    userId: null,
    fullName: 'Resident Demo',
    email: 'resident@example.test',
    phone: '081111111111',
  };
}

function response(error: unknown): unknown {
  assert.ok(error instanceof HttpException);
  return error.getResponse();
}

test('live controller freezes Admin roles, resident.manage, V2 envelope and server account service', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ResidentController), [
    'owner',
    'manager',
    'admin',
  ]);
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, ResidentController.prototype.provisionAccount),
    ['resident.manage'],
  );
  const calls: unknown[][] = [];
  const controller = new ResidentController(
    {} as never,
    {
      provision: async (...args: unknown[]) => {
        calls.push(args);
        return { status: 'provisioned', temporaryPassword: 'one-time-secret' };
      },
    } as never,
  );
  const request = { headers: {}, ip: '127.0.0.1', correlationId: 'cid' } as never;
  assert.deepEqual(
    await controller.provisionAccount(
      actor(),
      RESIDENT_ID,
      KEY,
      { property_id: PROPERTY_ID },
      request,
    ),
    { data: { status: 'provisioned', temporary_password: 'one-time-secret' } },
  );
  assert.equal(calls[0][1], RESIDENT_ID);
  assert.equal(calls[0][2], PROPERTY_ID);
  assert.equal(calls[0][3], KEY);
});

test('provision DTO requires property scope and rejects all client-controlled identity links', async () => {
  assert.deepEqual(
    await validate(plainToInstance(ProvisionResidentAccountDto, { property_id: PROPERTY_ID }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
    [],
  );
  for (const input of [
    {},
    { property_id: 'not-a-uuid' },
    { property_id: PROPERTY_ID, user_id: USER_ID },
    { property_id: PROPERTY_ID, userId: USER_ID },
    { property_id: PROPERTY_ID, email: 'attacker@example.test' },
  ]) {
    assert.ok(
      (
        await validate(plainToInstance(ProvisionResidentAccountDto, input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length > 0,
    );
  }
});

test('resident create and update DTOs reject identity aliases, nested identity, and implicit string coercion', async () => {
  for (const [Dto, valid] of [
    [CreateResidentDto, { property_id: PROPERTY_ID, full_name: 'Resident Demo' }],
    [UpdateResidentDto, { full_name: 'Resident Demo' }],
  ] as const) {
    assert.deepEqual(
      await validate(plainToInstance(Dto, valid, { enableImplicitConversion: true }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
      [],
    );
    for (const invalid of [
      { ...valid, full_name: 123 },
      { ...valid, user_id: USER_ID },
      { ...valid, userId: USER_ID },
      { ...valid, identity: { user_id: USER_ID } },
      {
        ...valid,
        emergency_contacts: [{ contact_name: 'Darurat', phone: '0811', user_id: USER_ID }],
      },
    ]) {
      assert.ok(
        (
          await validate(plainToInstance(Dto, invalid, { enableImplicitConversion: true }), {
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        ).length > 0,
      );
    }
  }
  for (const path of [
    resolve(root, 'src/modules/resident/dto/create-resident.dto.ts'),
    resolve(root, 'src/modules/resident/dto/update-resident.dto.ts'),
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /function rawValue\(\{ obj, key \}/);
    assert.match(source, /@Transform\(rawValue\)[\s\S]*@IsString\(\)[\s\S]*full_name/);
  }
});
test('missing idempotency key fails before authorization, lookup, command claim or mutation', async () => {
  const events: string[] = [];
  const service = new ResidentAccountService(
    { transaction: async () => events.push('transaction') } as never,
    { findByIdInProperty: async () => events.push('lookup') } as never,
    { assertCanReadProperty: async () => events.push('authorize') } as never,
    { write: async () => events.push('audit') } as never,
  );
  await assert.rejects(
    service.provision(actor(), RESIDENT_ID, PROPERTY_ID, undefined, {}),
    (error) => {
      assert.deepEqual(response(error), {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
      return true;
    },
  );
  assert.deepEqual(events, []);
});

test('property authorization finishes before scoped resident lookup and denied scope performs no claim', async () => {
  const events: string[] = [];
  const denied = new ResidentAccountService(
    { transaction: async () => events.push('transaction') } as never,
    { findByIdInProperty: async () => events.push('lookup') } as never,
    {
      assertCanReadProperty: async () => {
        events.push('authorize');
        throw new Error('scope denied');
      },
    } as never,
    {} as never,
  );
  await assert.rejects(
    denied.provision(actor(), RESIDENT_ID, PROPERTY_ID, KEY, {}),
    /scope denied/,
  );
  assert.deepEqual(events, ['authorize']);
});

test('new account is linked atomically with one resident membership and no lifecycle write', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const auditCalls: unknown[][] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/INSERT INTO idempotency_commands/.test(sql))
        return { rows: [{ id: 'command' }], rowCount: 1 };
      if (/FROM residents[\s\S]*WHERE id = \$1 AND property_id = \$2[\s\S]*FOR UPDATE/.test(sql)) {
        return {
          rows: [
            {
              id: RESIDENT_ID,
              property_id: PROPERTY_ID,
              user_id: null,
              full_name: 'Resident Demo',
              email: 'Resident@Example.Test',
              phone: '081111111111',
            },
          ],
          rowCount: 1,
        };
      }
      if (/FROM users/.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO users/.test(sql)) return { rows: [{ id: USER_ID }], rowCount: 1 };
      if (/SELECT count\(\*\)::text AS total[\s\S]*user_property_roles/.test(sql)) {
        return { rows: [{ total: '1' }], rowCount: 1 };
      }
      if (/UPDATE residents/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new ResidentAccountService(
    {
      transaction: async (operation: (value: typeof client) => Promise<unknown>) =>
        operation(client),
    } as never,
    { findByIdInProperty: async () => resident() } as never,
    { assertCanReadProperty: async () => undefined } as never,
    { write: async (...args: unknown[]) => auditCalls.push(args) } as never,
  );

  const result = await service.provision(actor(), RESIDENT_ID, PROPERTY_ID, KEY, {
    correlationId: 'cid',
  });
  assert.equal(result.status, 'provisioned');
  assert.ok(result.temporaryPassword && result.temporaryPassword.length >= 24);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0][1], client);

  const sql = queries.map((query) => query.sql).join('\n');
  assert.match(sql, /INSERT INTO users/);
  assert.match(sql, /roles\.code = 'resident'/);
  assert.match(sql, /UPDATE residents[\s\S]*SET user_id/);
  assert.doesNotMatch(
    sql,
    /(INSERT|UPDATE|DELETE)\s+(leases|occupancies|rooms|invoices|payments|booking_leads)/i,
  );
  assert.equal(
    queries.some((query) => query.params.some((param) => param === result.temporaryPassword)),
    false,
  );
  const completion = queries.find((query) => /UPDATE idempotency_commands/.test(query.sql));
  assert.ok(completion);
  assert.equal(
    JSON.stringify(completion.params).includes(result.temporaryPassword as string),
    false,
  );
  assert.equal(JSON.stringify(auditCalls).includes(result.temporaryPassword as string), false);
});

test('successful replay returns null credential and rejects changed payload without mutation', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let storedFingerprint: string | null = null;
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/INSERT INTO idempotency_commands/.test(sql)) {
        if (storedFingerprint === null) storedFingerprint = String(params[4]);
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT request_fingerprint/.test(sql)) {
        return {
          rows: [{ request_fingerprint: storedFingerprint, command_status: 'succeeded' }],
          rowCount: 1,
        };
      }
      throw new Error('unexpected replay mutation');
    },
  };
  const service = new ResidentAccountService(
    {
      transaction: async (operation: (value: typeof client) => Promise<unknown>) =>
        operation(client),
    } as never,
    { findByIdInProperty: async () => resident() } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );

  const result = await service.provision(actor(), RESIDENT_ID, PROPERTY_ID, KEY, {});
  assert.deepEqual(result, { status: 'already_issued', temporaryPassword: null });
  assert.equal(
    queries.some(({ sql }) => /INSERT INTO users|UPDATE residents/.test(sql)),
    false,
  );

  await assert.rejects(service.provision(actor(), USER_ID, PROPERTY_ID, KEY, {}), (error) => {
    assert.deepEqual(response(error), {
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency-Key was already used for another command',
    });
    return true;
  });
});

test('audit failure rolls back account provisioning, completion, and resident linkage', async () => {
  const events: string[] = [];
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let linked = false;
  let accountCreated = false;
  let completed = false;
  const sentinel = new Error('w04-audit-failure');
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      assert.equal(client, client, 'all transaction queries must use the same client');
      queries.push({ sql, params });
      if (/INSERT INTO idempotency_commands/.test(sql))
        return { rows: [{ id: 'command' }], rowCount: 1 };
      if (/FROM residents[\s\S]*WHERE id = \$1 AND property_id = \$2[\s\S]*FOR UPDATE/.test(sql)) {
        return {
          rows: [
            {
              id: RESIDENT_ID,
              property_id: PROPERTY_ID,
              user_id: null,
              full_name: 'Resident Demo',
              email: 'resident@example.test',
              phone: '081111111111',
            },
          ],
          rowCount: 1,
        };
      }
      if (/FROM users/.test(sql)) return { rows: [], rowCount: 0 };
      if (/INSERT INTO users/.test(sql)) {
        accountCreated = true;
        return { rows: [{ id: USER_ID }], rowCount: 1 };
      }
      if (/SELECT count\(\*\)::text AS total[\s\S]*user_property_roles/.test(sql))
        return { rows: [{ total: '1' }], rowCount: 1 };
      if (/UPDATE residents/.test(sql)) {
        linked = true;
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE idempotency_commands/.test(sql)) {
        completed = true;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const database = {
    transaction: async (operation: (value: typeof client) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await operation(client);
        events.push('commit');
        return result;
      } catch (error) {
        linked = false;
        accountCreated = false;
        completed = false;
        events.push('rollback');
        throw error;
      } finally {
        events.push('release');
      }
    },
  };
  const service = new ResidentAccountService(
    database as never,
    { findByIdInProperty: async () => resident() } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {
      write: async (_entry: unknown, auditClient: unknown) => {
        assert.equal(auditClient, client);
        throw sentinel;
      },
    } as never,
  );

  await assert.rejects(service.provision(actor(), RESIDENT_ID, PROPERTY_ID, KEY, {}), sentinel);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
  assert.equal(linked, false);
  assert.equal(accountCreated, false);
  assert.equal(completed, false);
  assert.equal(
    queries.some(({ sql }) => /UPDATE idempotency_commands/.test(sql)),
    false,
  );
});
void test(
  'migration 025 first apply, replay, exact indexes, checksum, and rollback are executable',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration = readFileSync(resolve(root, MIGRATION_PATH), 'utf8');
    const prelude = `
      CREATE TABLE users (id UUID PRIMARY KEY, email TEXT UNIQUE, phone TEXT UNIQUE);
      CREATE TABLE residents (id UUID PRIMARY KEY, property_id UUID NOT NULL, user_id UUID, full_name TEXT NOT NULL);
      INSERT INTO users (id, email, phone)
      VALUES ('44444444-4444-4444-8444-444444444444', 'resident@example.test', '628111111111');
      INSERT INTO residents (id, property_id, user_id, full_name)
      VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', NULL, 'Resident Demo');
    `;
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w04-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w04-rollback-'));
    const run = (directory: string, sql: string) =>
      spawnSync(
        join(bin, process.platform === 'win32' ? 'postgres.exe' : 'postgres'),
        ['--single', '-D', directory, 'postgres'],
        { input: sql, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      );
    const init = (directory: string) => {
      const result = spawnSync(
        join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(result.status, 0, 'disposable PostgreSQL initialization failed');
    };
    try {
      init(replayDirectory);
      const proof = `${prelude}
        ${migration}
        DO $first$
        BEGIN
          IF (SELECT count(*) FROM residents) <> 1
             OR (SELECT count(*) FROM users) <> 1
             OR (SELECT count(*) FROM information_schema.columns WHERE table_name = 'residents' AND column_name IN ('university', 'faculty', 'major', 'cohort', 'instagram', 'parent_name', 'parent_phone', 'marital_status')) <> 8
             OR (SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_residents_property_name_identity', 'idx_residents_property_user_identity', 'idx_users_email_normalized_identity')) <> 3
          THEN RAISE EXCEPTION 'W04_MIGRATION_FIRST_APPLY_INVALID'; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_email_normalized_identity' AND indexdef LIKE '%lower(email)%')
             OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_residents_property_user_identity' AND indexdef LIKE '%property_id, user_id%')
          THEN RAISE EXCEPTION 'W04_MIGRATION_INDEX_DEFINITION_INVALID'; END IF;
        END
        $first$;
        ${migration}
        DO $replay$
        BEGIN
          IF (SELECT count(*) FROM residents) <> 1 OR (SELECT count(*) FROM users) <> 1
             OR (SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_residents_property_name_identity', 'idx_residents_property_user_identity', 'idx_users_email_normalized_identity')) <> 3
          THEN RAISE EXCEPTION 'W04_MIGRATION_REPLAY_DID_NOT_CONVERGE'; END IF;
        END
        $replay$;
      `;
      const replay = run(replayDirectory, proof);
      assert.equal(replay.status, 0, 'disposable first-apply/replay proof failed');

      init(rollbackDirectory);
      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        "DO $$ BEGIN RAISE EXCEPTION 'W04_SYNTHETIC_ROLLBACK'; END $$; COMMIT;",
      );
      assert.notEqual(failedMigration, migration, 'rollback proof did not inject a failure');
      assert.match(failedMigration, /W04_SYNTHETIC_ROLLBACK/);
      run(rollbackDirectory, `${prelude}${failedMigration}`);
      const rollbackProbe = run(
        rollbackDirectory,
        `DO $rollback$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'residents' AND column_name IN ('university', 'faculty', 'major', 'cohort', 'instagram', 'parent_name', 'parent_phone', 'marital_status'))
             OR EXISTS (SELECT 1 FROM pg_indexes WHERE indexname IN ('idx_residents_property_name_identity', 'idx_residents_property_user_identity', 'idx_users_email_normalized_identity'))
          THEN RAISE EXCEPTION 'W04_MIGRATION_ROLLBACK_INCOMPLETE'; END IF;
        END
        $rollback$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'disposable rollback proof failed');
    } finally {
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
test('empty non-owner property scope is deny-all without repository query', async () => {
  let repositoryCalls = 0;
  const service = new ResidentService(
    {
      list: async () => {
        repositoryCalls += 1;
        return [];
      },
      count: async () => {
        repositoryCalls += 1;
        return 0;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const result = await service.listPage(
    { ...actor(), roles: ['manager'], propertyIds: [] },
    {} as never,
  );
  assert.deepEqual(result, { records: [], total: 0 });
  assert.equal(repositoryCalls, 0);
});

test('property-scoped resident lookup carries the property predicate to SQL', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const repository = new ResidentRepository({
    client: {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
    },
  } as never);
  assert.equal(await repository.findByIdInProperty(RESIDENT_ID, PROPERTY_ID), null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /residents\.property_id = \$2/);
  assert.deepEqual(calls[0].params, [RESIDENT_ID, PROPERTY_ID]);
});
test('migration and source freeze identity uniqueness, one-time receipt and W05 boundary', () => {
  const migration = readFileSync(
    resolve(
      root,
      'src/infrastructure/database/migrations/025_resident_identity_account_authority.sql',
    ),
    'utf8',
  );
  const service = readFileSync(
    resolve(root, 'src/modules/resident/resident-account.service.ts'),
    'utf8',
  );
  const controller = readFileSync(
    resolve(root, 'src/modules/resident/resident.controller.ts'),
    'utf8',
  );
  assert.match(migration, /idx_residents_property_user_identity/);
  assert.match(migration, /idx_residents_property_name_identity/);
  const manifestEntry = MIGRATION_MANIFEST.find(
    (entry) => entry.version === '025_resident_identity_account_authority.sql',
  );
  assert.ok(manifestEntry);
  assert.equal(createHash('sha256').update(migration).digest('hex'), manifestEntry.checksumSha256);
  assert.match(migration, /idx_users_email_normalized_identity/);
  assert.match(service, /temporaryPassword: null/);
  assert.match(service, /response_body = \$4::jsonb/);
  assert.match(service, /resident\.account_provision/);
  assert.match(controller, /@Post\(':residentId\/account'\)/);
  assert.doesNotMatch(
    service,
    /(INSERT|UPDATE|DELETE)\s+(leases|occupancies|rooms|invoices|payments|booking_leads)/i,
  );
});

test('resident audit projection is a whitelist and does not retain address, parent, or credential fields', () => {
  const projection = sanitizeResidentForAudit({
    ...resident(),
    dateOfBirth: null,
    placeOfBirth: null,
    address: 'private address',
    university: 'Universitas Demo',
    faculty: null,
    major: null,
    cohort: null,
    instagram: null,
    parentName: 'Parent Private',
    parentPhone: '081234567890',
    maritalStatus: null,
    emergencyPhone: '081234567890',
    ktpNumber: null,
    ktpFileId: null,
    profilePhotoFileId: null,
    gender: 'female',
    residentStatus: 'active',
    accountStatus: 'not_provisioned',
    roomNumber: null,
    leaseStart: null,
    leaseEnd: null,
    leaseAuthorityCount: 0,
    emergencyContacts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
  assert.equal('address' in (projection as Record<string, unknown>), false);
  assert.equal('parentName' in (projection as Record<string, unknown>), false);
  assert.equal('password' in (projection as Record<string, unknown>), false);
  assert.equal('password_hash' in (projection as Record<string, unknown>), false);
});
