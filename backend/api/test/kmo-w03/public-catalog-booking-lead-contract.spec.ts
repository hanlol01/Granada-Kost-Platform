import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { BookingLeadService } from '../../src/modules/booking-lead/booking-lead.service';
import { BookingLeadRepository } from '../../src/modules/booking-lead/repositories/booking-lead.repository';
import type { BookingLeadRecord } from '../../src/modules/booking-lead/types/booking-lead.types';

const projectRoot = existsSync(resolve(process.cwd(), 'apps'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(projectRoot, path), 'utf8');

function initializePostgres(bin: string, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const result = spawnSync(
    join(bin, process.platform === 'win32' ? 'initdb.exe' : 'initdb'),
    ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, 'disposable PostgreSQL initialization failed');
  return directory;
}

function runSingleUser(bin: string, directory: string, sql: string) {
  return spawnSync(
    join(bin, process.platform === 'win32' ? 'postgres.exe' : 'postgres'),
    ['--single', '-D', directory, 'postgres'],
    { input: sql, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
}

const migrationPrelude = `
  CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL);
  CREATE TABLE booking_leads (
    id UUID PRIMARY KEY,
    property_id UUID REFERENCES properties(id),
    room_id UUID NULL,
    category TEXT NOT NULL,
    gender TEXT NOT NULL,
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT NOT NULL,
    visitor_university TEXT NULL,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  INSERT INTO properties (id, status)
  VALUES ('20000000-0000-4000-8000-000000000001', 'active');
  INSERT INTO booking_leads (
    id, property_id, category, gender, visitor_name, visitor_phone,
    visitor_university, source
  ) VALUES
    ('30000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
     'Legacy public', '6281111111111', NULL, 'public_kamar'),
    ('30000000-0000-4000-8000-000000000002',
     '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
     'Admin lead', '6281111111111', NULL, 'admin');
`;

const migrationPath =
  'backend/api/src/infrastructure/database/migrations/024_public_booking_lead_contact.sql';

test('W03 public catalog is category-only and excludes internal inventory fields', () => {
  const service = read('backend/api/src/modules/room/public-hunian-catalog.service.ts');
  const types = read('backend/api/src/modules/room/types/public-hunian-catalog.types.ts');
  assert.match(service, /listPublicCatalogGroups/);
  assert.match(service, /publishedCategories/);
  assert.match(service, /publicGallery\(projection\.gallery\)/);
  assert.doesNotMatch(service, /HunianGalleryService|publicGalleryForCatalogTargets/);
  assert.doesNotMatch(types, /buildingCode|buildingName|floorCode|floorLabel|publicGroupKey/);
  assert.match(service, /leaseMinimumMonths: 12/);
  assert.match(service, /securityDepositMonths/);
});

test('W03 public lead has strict contact, consent, and no room authority', () => {
  const dto = read('backend/api/src/modules/booking-lead/dto/create-public-booking-lead.dto.ts');
  const service = read('backend/api/src/modules/booking-lead/booking-lead.service.ts');
  const controller = read('backend/api/src/modules/booking-lead/public-booking-lead.controller.ts');
  assert.match(dto, /visitorEmail/);
  assert.match(dto, /visitorUniversity!/);
  assert.match(dto, /consent/);
  assert.doesNotMatch(dto, /roomId|propertyId|buildingCode|floorCode/);
  assert.match(service, /BOOKING_LEAD_CONSENT_REQUIRED/);
  assert.match(service, /source: 'public_kamar'/);
  assert.match(controller, /idempotency-key/);
  assert.match(service, /lockPublicCreation/);
  assert.match(service, /writePublicCreatedEvent/);
  assert.match(service, /BOOKING_LEAD_IDEMPOTENCY_KEY_REUSED/);
  assert.doesNotMatch(service, /updateRoom|updateStatus\(.*public/);
});

test('public lead creation is one locked transaction with atomic safe evidence', async () => {
  const calls: string[] = [];
  const client = { tag: 'transaction-client' };
  const lead: BookingLeadRecord = {
    id: '10000000-0000-4000-8000-000000000001',
    propertyId: '20000000-0000-4000-8000-000000000001',
    roomId: null,
    roomNumber: null,
    category: 'rukost',
    gender: 'female',
    buildingCode: null,
    floorCode: null,
    publicGroupKey: null,
    visitorName: 'Calon penghuni',
    visitorEmail: 'calon@example.test',
    visitorPhone: '6281111111111',
    visitorAddress: null,
    visitorUniversity: null,
    visitorMessage: null,
    preferredMoveInDate: '2026-08-15',
    activeLeaseStartDate: null,
    status: 'new',
    source: 'public_kamar',
    metadata: null,
    createdByUserId: null,
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
  };
  const leads = {
    resolvePublicPropertyId: async (_input: unknown, transactionClient: unknown) => {
      assert.equal(transactionClient, client);
      calls.push('resolve');
      return lead.propertyId;
    },
    transaction: async (work: (transactionClient: unknown) => Promise<unknown>) => {
      calls.push('begin');
      const result = await work(client);
      calls.push('commit');
      return result;
    },
    lockPublicCreation: async (transactionClient: unknown) => {
      assert.equal(transactionClient, client);
      calls.push('lock');
    },
    findByPublicIdempotencyKey: async () => {
      calls.push('idempotency');
      return null;
    },
    findRecentDuplicate: async () => {
      calls.push('duplicate');
      return null;
    },
    create: async (_input: unknown, transactionClient: unknown) => {
      assert.equal(transactionClient, client);
      calls.push('create');
      return lead;
    },
    writePublicCreatedEvent: async (transactionClient: unknown) => {
      assert.equal(transactionClient, client);
      calls.push('outbox');
    },
  };
  const audit = {
    write: async (input: { afterData?: Record<string, unknown> }, transactionClient: unknown) => {
      assert.equal(transactionClient, client);
      assert.deepEqual(Object.keys(input.afterData ?? {}).sort(), [
        'category',
        'gender',
        'id',
        'source',
        'status',
      ]);
      calls.push('audit');
    },
  };
  const service = new BookingLeadService(leads as never, audit as never);

  const response = await service.createPublicLead(
    {
      category: 'rukost',
      gender: 'female',
      visitorName: 'Calon penghuni',
      visitorEmail: 'calon@example.test',
      visitorPhone: '081111111111',
      visitorUniversity: 'Universitas Demo',
      preferredMoveInDate: '2026-08-15',
      consent: true,
    },
    { idempotencyKey: 'public-test-key-0001' },
  );

  assert.deepEqual(calls, [
    'begin',
    'resolve',
    'lock',
    'idempotency',
    'duplicate',
    'create',
    'audit',
    'outbox',
    'commit',
  ]);
  assert.match(response.reference, /^MINAT-RUKOST-[A-F0-9]{12}$/);
  assert.equal(response.status, 'new');
  assert.doesNotMatch(JSON.stringify(response), /10000000-0000-4000-8000-000000000001/);
  assert.deepEqual(Object.keys(response).sort(), [
    'category',
    'createdAt',
    'gender',
    'message',
    'reference',
    'status',
  ]);
});

test('public creation locks duplicate and idempotency identities deterministically', async () => {
  const lockQueries: unknown[][] = [];
  const repository = new BookingLeadRepository({} as never);
  await repository.lockPublicCreation(
    {
      query: async (_sql: string, values?: unknown[]) => {
        lockQueries.push(values ?? []);
        return { rows: [], rowCount: 0 };
      },
    } as never,
    {
      propertyId: '20000000-0000-4000-8000-000000000001',
      category: 'rukost',
      gender: 'female',
      visitorPhone: '6281111111111',
      idempotencyKey: 'public-test-key-0001',
    },
  );

  assert.equal(lockQueries.length, 2);
  assert.deepEqual(
    lockQueries.map((values) => values[0]),
    [...lockQueries.map((values) => values[0])].sort(),
  );
});

void test(
  'migration 024 first apply, replay, constraints, and rollback are executable',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration = read(migrationPath);
    const replayDirectory = initializePostgres(bin, 'kostation-w03-replay-');
    const rollbackDirectory = initializePostgres(bin, 'kostation-w03-rollback-');
    try {
      const proof = `${migrationPrelude}
        ${migration}
        DO $proof$
        BEGIN
          IF (SELECT count(*) FROM booking_leads) <> 2
            OR (SELECT count(*) FROM pg_constraint
                WHERE conname IN (
                  'booking_leads_visitor_email_length_check',
                  'booking_leads_public_contact_authority_check'
                )) <> 2
            OR (SELECT count(*) FROM pg_indexes
                WHERE indexname = 'idx_booking_leads_public_email_created') <> 1
          THEN
            RAISE EXCEPTION 'W03_FIRST_APPLY_STATE_INVALID';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE indexname = 'idx_booking_leads_public_email_created'
              AND indexdef LIKE '%(property_id, visitor_email, created_at DESC)%'
          ) THEN
            RAISE EXCEPTION 'W03_PROPERTY_EMAIL_INDEX_INVALID';
          END IF;
          INSERT INTO booking_leads (
            id, property_id, category, gender, visitor_name, visitor_phone,
            visitor_email, visitor_university, consent_at, consent_version, source
          ) VALUES (
            '30000000-0000-4000-8000-000000000003',
            '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
            'Valid public', '6281111111111', 'valid@example.test',
            'Universitas Demo', now(), 'public-lead-v1', 'public_kamar'
          );
          INSERT INTO booking_leads (
            id, property_id, category, gender, visitor_name, visitor_phone,
            visitor_email, visitor_university, consent_at, consent_version, source
          ) VALUES (
            '30000000-0000-4000-8000-000000000004',
            '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
            'Valid admin', '6281111111111', NULL, NULL, NULL, NULL, 'admin'
          );
          BEGIN
            INSERT INTO booking_leads (
              id, property_id, category, gender, visitor_name, visitor_phone,
              visitor_email, visitor_university, consent_at, consent_version, source
            ) VALUES (
              '30000000-0000-4000-8000-000000000005',
              '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
              'Missing email', '6281111111111', NULL, 'Universitas Demo',
              now(), 'public-lead-v1', 'public_kamar'
            );
            RAISE EXCEPTION 'W03_MISSING_EMAIL_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
          BEGIN
            INSERT INTO booking_leads (
              id, property_id, category, gender, visitor_name, visitor_phone,
              visitor_email, visitor_university, consent_at, consent_version, source
            ) VALUES (
              '30000000-0000-4000-8000-000000000006',
              '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
              'Missing university', '6281111111111', 'missing@example.test',
              NULL, now(), 'public-lead-v1', 'public_kamar'
            );
            RAISE EXCEPTION 'W03_MISSING_UNIVERSITY_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
          BEGIN
            INSERT INTO booking_leads (
              id, property_id, category, gender, visitor_name, visitor_phone,
              visitor_email, visitor_university, consent_at, consent_version, source
            ) VALUES (
              '30000000-0000-4000-8000-000000000007',
              '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
              'Missing consent date', '6281111111111', 'missing@example.test',
              'Universitas Demo', NULL, 'public-lead-v1', 'public_kamar'
            );
            RAISE EXCEPTION 'W03_MISSING_CONSENT_AT_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
          BEGIN
            INSERT INTO booking_leads (
              id, property_id, category, gender, visitor_name, visitor_phone,
              visitor_email, visitor_university, consent_at, consent_version, source
            ) VALUES (
              '30000000-0000-4000-8000-000000000008',
              '20000000-0000-4000-8000-000000000001', 'rukost', 'female',
              'Missing consent version', '6281111111111', 'missing@example.test',
              'Universitas Demo', now(), NULL, 'public_kamar'
            );
            RAISE EXCEPTION 'W03_MISSING_CONSENT_VERSION_ACCEPTED';
          EXCEPTION WHEN check_violation THEN NULL;
          END;
        END
        $proof$;
        ${migration}
        DO $replay$
        BEGIN
          IF (SELECT count(*) FROM booking_leads) <> 4
            OR (SELECT count(*) FROM pg_constraint
                WHERE conname IN (
                  'booking_leads_visitor_email_length_check',
                  'booking_leads_public_contact_authority_check'
                )) <> 2
            OR (SELECT count(*) FROM pg_indexes
                WHERE indexname = 'idx_booking_leads_public_email_created') <> 1
          THEN
            RAISE EXCEPTION 'W03_REPLAY_DID_NOT_CONVERGE';
          END IF;
          IF to_regclass('public.rooms') IS NOT NULL
             OR to_regclass('public.holds') IS NOT NULL
             OR to_regclass('public.leases') IS NOT NULL
             OR to_regclass('public.residents') IS NOT NULL
             OR to_regclass('public.invoices') IS NOT NULL
             OR to_regclass('public.payments') IS NOT NULL
          THEN
            RAISE EXCEPTION 'W03_UNRELATED_SCHEMA_MUTATED';
          END IF;
        END
        $replay$;
      `;
      const replay = runSingleUser(bin, replayDirectory, proof);
      assert.equal(replay.status, 0, 'disposable first-apply/replay proof failed');

      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        "DO $$ BEGIN RAISE EXCEPTION 'W03_SYNTHETIC_ROLLBACK'; END $$; COMMIT;",
      );
      runSingleUser(bin, rollbackDirectory, `${migrationPrelude}${failedMigration}`);
      assert.notEqual(failedMigration, migration, 'rollback proof did not inject a failure');
      assert.match(failedMigration, /W03_SYNTHETIC_ROLLBACK/);
      const rollbackProbe = runSingleUser(
        bin,
        rollbackDirectory,
        `DO $proof$
         BEGIN
           IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'booking_leads' AND column_name IN (
                  'visitor_email', 'consent_at', 'consent_version'
                )
              )
              OR EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname IN (
                  'booking_leads_visitor_email_length_check',
                  'booking_leads_public_contact_authority_check'
                )
              )
              OR EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE indexname = 'idx_booking_leads_public_email_created'
              )
           THEN
             RAISE EXCEPTION 'W03_ROLLBACK_INCOMPLETE';
           END IF;
         END
         $proof$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'disposable rollback proof failed');
    } finally {
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);
test('migration 024 is checksum-addressed and additive', () => {
  const path =
    'backend/api/src/infrastructure/database/migrations/024_public_booking_lead_contact.sql';
  const migration = read(path);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS visitor_email/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS consent_at/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS consent_version/);
  assert.match(migration, /booking_leads_public_contact_authority_check/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE rooms/i);
  const checksum = createHash('sha256').update(read(path)).digest('hex');
  assert.match(
    read('backend/api/src/infrastructure/database/scripts/migration-manifest.ts'),
    new RegExp(checksum),
  );
});
