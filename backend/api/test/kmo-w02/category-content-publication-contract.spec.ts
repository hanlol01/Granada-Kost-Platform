import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import {
  PublishCategoryContentDto,
  SavePropertyPolicyDraftDto,
  ReplaceCategoryFacilitiesDto,
} from '../../src/modules/admin-ux-master/admin-ux-master.dto';
import {
  CreateHunianGalleryV2Dto,
  ReorderHunianGalleryV2Dto,
} from '../../src/modules/admin-ux-master/admin-ux-gallery-v2.dto';
import { AdminUxContentPublicationService } from '../../src/modules/admin-ux-master/admin-ux-content-publication.service';
import { AdminUxGalleryV2Service } from '../../src/modules/admin-ux-master/admin-ux-gallery-v2.service';
import { FileService } from '../../src/modules/file/file.service';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migrationPath =
  'backend/api/src/infrastructure/database/migrations/023_category_content_publication.sql';
const propertyId = '11111111-1111-4111-8111-111111111111';
const kostTypeId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const fileId = '44444444-4444-4444-8444-444444444444';
const derivativeId = '55555555-5555-4555-8555-555555555555';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: false },
});

function user() {
  return { id: actorId, roles: ['admin'], propertyIds: [propertyId] } as never;
}

function facilityBody() {
  return {
    property_id: propertyId,
    items: [
      {
        label: 'Wi-Fi',
        public_description: 'Internet kategori',
        sort_order: 0,
        content_state: 'active',
        public_visible: true,
      },
    ],
  };
}

function publicTerms() {
  return {
    pricing_explanation: 'Tarif mengikuti kategori.',
    minimum_lease_term: 'Satu tahun.',
    dp_explanation: 'DP adalah uang muka sewa.',
    security_deposit_explanation: 'Deposit dipisahkan dari sewa dan DP.',
    manual_payment_methods: ['Transfer manual'],
    house_rules: ['Jaga ketenangan'],
    visitor_hours: '21:00',
    contact_information: 'Hubungi pengelola melalui kanal resmi.',
    category_applicability: ['rukost', 'apartkost'],
  };
}

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
  CREATE TABLE users (id UUID PRIMARY KEY);
  CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL);
  CREATE TABLE kost_types (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id),
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE files (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id));
  CREATE TABLE hunian_gallery_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id),
    target_type TEXT NOT NULL,
    kost_type_id UUID REFERENCES kost_types(id),
    file_id UUID NOT NULL REFERENCES files(id),
    alt_text TEXT NOT NULL,
    caption TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_cover BOOLEAN NOT NULL DEFAULT false,
    public_visible BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE room_facilities (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_by_user_id UUID REFERENCES users(id),
    updated_by_user_id UUID REFERENCES users(id)
  );
  CREATE TABLE kost_type_facility_assignments (
    kost_type_id UUID NOT NULL REFERENCES kost_types(id),
    facility_id UUID NOT NULL REFERENCES room_facilities(id)
  );
  CREATE TABLE kost_type_rules (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id),
    rule_text TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    deleted_at TIMESTAMPTZ
  );
  INSERT INTO users (id) VALUES ('${actorId}');
  INSERT INTO properties (id, status) VALUES ('${propertyId}', 'active');
  INSERT INTO kost_types (id, property_id, category, status) VALUES
    ('${kostTypeId}', '${propertyId}', 'rukost', 'active'),
    ('66666666-6666-4666-8666-666666666666', '${propertyId}', 'apartkost', 'active');
  INSERT INTO files (id, property_id) VALUES
    ('${fileId}', '${propertyId}'),
    ('${derivativeId}', '${propertyId}');
  INSERT INTO room_facilities (id, name, description, status, sort_order) VALUES
    ('77777777-7777-4777-8777-777777777777', 'Wi-Fi', 'Internet kategori', 'active', 0),
    ('88888888-8888-4888-8888-888888888888', 'Lift', 'Akses vertikal', 'active', 0);
  INSERT INTO kost_type_facility_assignments (kost_type_id, facility_id) VALUES
    ('${kostTypeId}', '77777777-7777-4777-8777-777777777777'),
    ('66666666-6666-4666-8666-666666666666', '88888888-8888-4888-8888-888888888888');
  INSERT INTO hunian_gallery_images (
    property_id, target_type, kost_type_id, file_id, alt_text, sort_order, is_cover, public_visible
  ) VALUES
    ('${propertyId}', 'kost_type', '${kostTypeId}', '${fileId}', 'Draft category', 0, true, false),
    ('${propertyId}', 'common_area', NULL, '${fileId}', 'Legacy common area', 0, true, true);
`;

test('migration 023 is additive, replay-aware, and registered by checksum', () => {
  const migration = source(migrationPath);
  assert.match(migration, /^-- KMO-W02C-D/m);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kost_type_content_facilities/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS kost_type_content_versions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS property_policy_documents/);
  assert.match(migration, /public_derivative_file_id UUID/);
  assert.match(migration, /content_state IN \('active', 'archived'\)/);
  assert.match(migration, /content_type IN \('facilities', 'gallery'\)/);
  assert.match(migration, /publication_status IN \('draft', 'published', 'archived'\)/);
  assert.match(migration, /visitor_hours', '21:00'/);
  assert.match(migration, /W02CD_LEGACY_FACILITY_LABEL_AMBIGUOUS/);
  assert.match(migration, /content_state = 'archived'[\s\S]*target_type = 'common_area'/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM hunian_gallery_images/i);

  const checksum = createHash('sha256')
    .update(readFileSync(resolve(process.cwd(), migrationPath)))
    .digest('hex');
  const manifest = source('backend/api/src/infrastructure/database/scripts/migration-manifest.ts');
  assert.match(manifest, /version: '023_category_content_publication\.sql'/);
  assert.match(manifest, new RegExp(`checksumSha256: '${checksum}'`));
  for (const sentinel of [
    'kost_type_content_facilities',
    'kost_type_content_versions',
    'property_policy_documents',
    'public_derivative_file_id',
  ]) {
    assert.match(manifest, new RegExp(sentinel));
  }
});

void test(
  'migration 023 first apply, immediate replay, constraints, and rollback are executable',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration = source(migrationPath);
    const replayDirectory = initializePostgres(bin, 'kostation-w02cd-replay-');
    const rollbackDirectory = initializePostgres(bin, 'kostation-w02cd-rollback-');
    try {
      const proof = `${migrationPrelude}
        ${migration}
        CREATE TABLE migration_023_snapshot AS
        SELECT
          (SELECT count(*) FROM kost_type_content_facilities)::int AS facility_count,
          (SELECT count(*) FROM property_policy_documents)::int AS policy_count,
          (SELECT string_agg(id::text, ',' ORDER BY id) FROM kost_type_content_facilities) AS ids;
        ${migration}
        DO $proof$
        DECLARE snapshot migration_023_snapshot%ROWTYPE;
        BEGIN
          SELECT * INTO snapshot FROM migration_023_snapshot;
          IF snapshot.facility_count <> 2
            OR snapshot.policy_count <> 1
            OR snapshot.facility_count <> (SELECT count(*) FROM kost_type_content_facilities)
            OR snapshot.policy_count <> (SELECT count(*) FROM property_policy_documents)
            OR snapshot.ids <> (
              SELECT string_agg(id::text, ',' ORDER BY id) FROM kost_type_content_facilities
            )
          THEN
            RAISE EXCEPTION 'W02CD_REPLAY_DID_NOT_CONVERGE';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM hunian_gallery_images
            WHERE target_type = 'common_area' AND content_state = 'archived'
              AND archived_at IS NOT NULL AND is_cover = false AND public_visible = false
          ) THEN
            RAISE EXCEPTION 'W02CD_LEGACY_GALLERY_NOT_ARCHIVED';
          END IF;
          BEGIN
            INSERT INTO hunian_gallery_images (
              property_id, target_type, kost_type_id, file_id, alt_text,
              sort_order, is_cover, public_visible, content_state
            ) VALUES (
              '${propertyId}', 'kost_type', '${kostTypeId}', '${derivativeId}',
              'Duplicate cover', 1, true, false, 'draft'
            );
            RAISE EXCEPTION 'W02CD_SECOND_COVER_ACCEPTED';
          EXCEPTION WHEN unique_violation THEN
            NULL;
          END;
          BEGIN
            UPDATE kost_type_content_facilities
            SET content_state = 'archived', public_visible = false
            WHERE kost_type_id = '${kostTypeId}';
            RAISE EXCEPTION 'W02CD_ARCHIVE_WITHOUT_TIMESTAMP_ACCEPTED';
          EXCEPTION WHEN check_violation THEN
            NULL;
          END;
          INSERT INTO kost_type_content_versions (
            property_id, kost_type_id, content_type, version, publication_status,
            effective_date, payload, published_by_user_id
          ) VALUES (
            '${propertyId}', '${kostTypeId}', 'facilities', 1, 'published',
            CURRENT_DATE, '{"items":[]}'::jsonb, '${actorId}'
          );
          UPDATE kost_type_content_versions
          SET publication_status = 'archived', archived_at = now()
          WHERE kost_type_id = '${kostTypeId}' AND content_type = 'facilities';
          BEGIN
            UPDATE kost_type_content_versions
            SET payload = '{"items":[{"label":"tampered"}]}'::jsonb
            WHERE kost_type_id = '${kostTypeId}' AND content_type = 'facilities';
            RAISE EXCEPTION 'W02CD_ARCHIVED_CATEGORY_VERSION_MUTABLE';
          EXCEPTION WHEN object_not_in_prerequisite_state THEN
            NULL;
          END;
          UPDATE property_policy_documents
          SET publication_status = 'published', effective_date = CURRENT_DATE,
              published_at = now(), published_by_user_id = '${actorId}'
          WHERE property_id = '${propertyId}' AND publication_status = 'draft';
          UPDATE property_policy_documents
          SET publication_status = 'archived', archived_at = now()
          WHERE property_id = '${propertyId}' AND publication_status = 'published';
          BEGIN
            UPDATE property_policy_documents
            SET public_content = '{"tampered":true}'::jsonb
            WHERE property_id = '${propertyId}' AND publication_status = 'archived';
            RAISE EXCEPTION 'W02CD_ARCHIVED_POLICY_VERSION_MUTABLE';
          EXCEPTION WHEN object_not_in_prerequisite_state THEN
            NULL;
          END;
        END
        $proof$;
      `;
      const replay = runSingleUser(bin, replayDirectory, proof);
      assert.equal(replay.status, 0, 'disposable first-apply/replay proof failed');

      const failedMigration = migration.replace(
        /COMMIT;\s*$/,
        "DO $rollback$ BEGIN RAISE EXCEPTION 'W02CD_SYNTHETIC_ROLLBACK'; END $rollback$; COMMIT;",
      );
      runSingleUser(bin, rollbackDirectory, `${migrationPrelude}${failedMigration}`);
      const rollbackProbe = runSingleUser(
        bin,
        rollbackDirectory,
        `DO $proof$ BEGIN
           IF to_regclass('public.kost_type_content_facilities') IS NOT NULL
             OR to_regclass('public.kost_type_content_versions') IS NOT NULL
             OR to_regclass('public.property_policy_documents') IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM information_schema.columns
               WHERE table_name = 'hunian_gallery_images'
                 AND column_name = 'public_derivative_file_id'
             )
           THEN
             RAISE EXCEPTION 'W02CD_ROLLBACK_INCOMPLETE';
           END IF;
         END $proof$;`,
      );
      assert.equal(rollbackProbe.status, 0, 'disposable rollback proof failed');
    } finally {
      rmSync(replayDirectory, { recursive: true, force: true });
      rmSync(rollbackDirectory, { recursive: true, force: true });
    }
  },
);

test('category, gallery, and public terms DTOs reject coercion and unknown authority', async () => {
  await assert.doesNotReject(() =>
    pipe.transform(facilityBody(), { type: 'body', metatype: ReplaceCategoryFacilitiesDto }),
  );
  await assert.rejects(() =>
    pipe.transform(
      {
        ...facilityBody(),
        room_id: '66666666-6666-4666-8666-666666666666',
      },
      { type: 'body', metatype: ReplaceCategoryFacilitiesDto },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      {
        ...facilityBody(),
        items: [{ ...facilityBody().items[0], public_visible: 'true' }],
      },
      { type: 'body', metatype: ReplaceCategoryFacilitiesDto },
    ),
  );

  const gallery = {
    property_id: propertyId,
    target_type: 'kost_type',
    kost_type_id: kostTypeId,
    file_id: fileId,
    public_derivative_file_id: derivativeId,
    alt_text: 'Kamar kategori Rumah Kost',
  };
  await assert.doesNotReject(() =>
    pipe.transform(gallery, { type: 'body', metatype: CreateHunianGalleryV2Dto }),
  );
  for (const mutation of [
    { ...gallery, target_type: 'common_area' },
    { ...gallery, common_area_key: 'lobby' },
    { ...gallery, sort_order: '0' },
    { ...gallery, public_visible: true },
  ]) {
    await assert.rejects(() =>
      pipe.transform(mutation, { type: 'body', metatype: CreateHunianGalleryV2Dto }),
    );
  }
  await assert.rejects(() =>
    pipe.transform(
      {
        property_id: propertyId,
        target_type: 'kost_type',
        kost_type_id: kostTypeId,
        items: [{ id: fileId, sort_order: '0' }],
      },
      { type: 'body', metatype: ReorderHunianGalleryV2Dto },
    ),
  );

  const policy = {
    property_id: propertyId,
    internal_operating_policy: 'Catatan internal.',
    public_content: publicTerms(),
  };
  await assert.doesNotReject(() =>
    pipe.transform(policy, { type: 'body', metatype: SavePropertyPolicyDraftDto }),
  );
  await assert.rejects(() =>
    pipe.transform(
      {
        ...policy,
        public_content: { ...publicTerms(), internal_operating_policy: 'leak' },
      },
      { type: 'body', metatype: SavePropertyPolicyDraftDto },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      { property_id: propertyId, content_type: 'facilities', effective_date: 'not-a-date' },
      { type: 'body', metatype: PublishCategoryContentDto },
    ),
  );
  await assert.rejects(() =>
    pipe.transform(
      {
        property_id: propertyId,
        content_type: 'facilities',
        effective_date: '2026-08-01T00:00:00.000Z',
      },
      { type: 'body', metatype: PublishCategoryContentDto },
    ),
  );
});

test('duplicate facility normalization fails before transaction or mutation', async () => {
  let transactionCount = 0;
  const service = new AdminUxContentPublicationService(
    {
      transaction: async () => {
        transactionCount += 1;
        throw new Error('transaction must not run');
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );
  await assert.rejects(
    () =>
      service.replaceFacilities(
        user(),
        kostTypeId,
        {
          property_id: propertyId,
          items: [
            { ...facilityBody().items[0], label: ' Wi-Fi ' },
            { ...facilityBody().items[0], label: 'wi-fi', sort_order: 1 },
          ],
        },
        {} as never,
        'duplicate-facility',
      ),
    (error: unknown) => JSON.stringify(error).includes('CATEGORY_FACILITY_DUPLICATE_LABEL'),
  );
  assert.equal(transactionCount, 0);
});

test('property authorization finishes before category lookup, idempotency, or writes', async () => {
  let databaseAccess = 0;
  const service = new AdminUxContentPublicationService(
    {
      client: {
        query: async () => {
          databaseAccess += 1;
          throw new Error('database must not be reached');
        },
      },
      transaction: async () => {
        databaseAccess += 1;
        throw new Error('transaction must not be reached');
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
    () => service.categoryWorkspace(user(), propertyId, kostTypeId),
    /property denied/,
  );
  await assert.rejects(
    () => service.replaceFacilities(user(), kostTypeId, facilityBody(), {} as never, 'auth-order'),
    /property denied/,
  );
  assert.equal(databaseAccess, 0);
});

test('gallery update, cover, and archive authorize the explicit property before lookup', async () => {
  let databaseAccess = 0;
  const service = new AdminUxGalleryV2Service(
    {
      client: {
        query: async () => {
          databaseAccess += 1;
          throw new Error('database must not be reached');
        },
      },
      transaction: async () => {
        databaseAccess += 1;
        throw new Error('transaction must not be reached');
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        throw new Error('property denied');
      },
    } as never,
    {} as never,
  );
  const context = {} as never;
  await assert.rejects(
    () =>
      service.update(
        user(),
        fileId,
        { property_id: propertyId, alt_text: 'Updated category image' },
        context,
        'gallery-update-auth',
      ),
    /property denied/,
  );
  await assert.rejects(
    () =>
      service.setCover(user(), fileId, { property_id: propertyId }, context, 'gallery-cover-auth'),
    /property denied/,
  );
  await assert.rejects(
    () =>
      service.remove(user(), fileId, { property_id: propertyId }, context, 'gallery-archive-auth'),
    /property denied/,
  );
  assert.equal(databaseAccess, 0);
});

test('invalid gallery file pair leaves no gallery row or command claim', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('FROM kost_types')) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              category: 'apartkost',
            },
            { id: kostTypeId, category: 'rukost' },
          ],
        };
      }
      if (sql.includes('FROM files')) {
        return {
          rows: [
            {
              id: fileId,
              property_id: propertyId,
              file_purpose: 'hunian_gallery',
              mime_type: 'image/jpeg',
              is_deleted: false,
              metadata: { width: 3000, height: 2000 },
            },
            {
              id: derivativeId,
              property_id: propertyId,
              file_purpose: 'hunian_gallery',
              mime_type: 'image/jpeg',
              is_deleted: false,
              metadata: { width: 2400, height: 1600 },
            },
          ],
        };
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  };
  const service = new AdminUxGalleryV2Service(
    { transaction: async (run: (value: unknown) => unknown) => run(client) } as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );
  await assert.rejects(
    () =>
      service.create(
        user(),
        {
          property_id: propertyId,
          target_type: 'kost_type',
          kost_type_id: kostTypeId,
          file_id: fileId,
          public_derivative_file_id: derivativeId,
          alt_text: 'Foto kategori',
        },
        {} as never,
        'invalid-dimensions',
      ),
    (error: unknown) =>
      JSON.stringify(error).includes('GALLERY_PUBLIC_DERIVATIVE_DIMENSIONS_INVALID'),
  );
  assert.equal(
    calls.some((sql) => sql.includes('INSERT INTO hunian_gallery_images')),
    false,
  );
  assert.equal(
    calls.some((sql) => sql.includes('INSERT INTO idempotency_commands')),
    false,
  );
});

test('file dimension authority rejects malformed and oversized image metadata', () => {
  const service = new FileService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    imageDimensions: (
      buffer: Buffer,
      mime: 'image/png',
    ) => { width: number; height: number } | null;
  };
  const png = Buffer.alloc(24);
  png.writeUInt32BE(1920, 16);
  png.writeUInt32BE(1080, 20);
  assert.deepEqual(service.imageDimensions(png, 'image/png'), { width: 1920, height: 1080 });
  assert.equal(service.imageDimensions(Buffer.alloc(10), 'image/png'), null);
  png.writeUInt32BE(0, 16);
  assert.equal(service.imageDimensions(png, 'image/png'), null);
});

test('public derivative metadata scanner fails closed for embedded image metadata', () => {
  const service = new FileService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    hasNoPublicImageMetadata: (buffer: Buffer, mime: 'image/jpeg' | 'image/png') => boolean;
  };
  const cleanJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00]);
  const exifJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x02, 0xff, 0xda, 0x00, 0x00]);
  assert.equal(service.hasNoPublicImageMetadata(cleanJpeg, 'image/jpeg'), true);
  assert.equal(service.hasNoPublicImageMetadata(exifJpeg, 'image/jpeg'), false);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string) => {
    const value = Buffer.alloc(12);
    value.writeUInt32BE(0, 0);
    value.write(type, 4, 4, 'ascii');
    return value;
  };
  assert.equal(
    service.hasNoPublicImageMetadata(Buffer.concat([signature, chunk('IEND')]), 'image/png'),
    true,
  );
  assert.equal(
    service.hasNoPublicImageMetadata(
      Buffer.concat([signature, chunk('tEXt'), chunk('IEND')]),
      'image/png',
    ),
    false,
  );
});

test('live paths lock publication, preserve history, and expose only published derivatives', () => {
  const publication = source(
    'backend/api/src/modules/admin-ux-master/admin-ux-content-publication.service.ts',
  );
  const gallery = source('backend/api/src/modules/admin-ux-master/admin-ux-gallery-v2.service.ts');
  const controller = source(
    'backend/api/src/modules/admin-ux-master/admin-ux-master.controller.ts',
  );
  const galleryController = source(
    'backend/api/src/modules/hunian-gallery/hunian-gallery.controller.ts',
  );
  const publicController = source(
    'backend/api/src/modules/room/public-hunian-catalog.controller.ts',
  );
  const publicService = source('backend/api/src/modules/room/public-hunian-catalog.service.ts');
  const repository = source('backend/api/src/modules/hunian-gallery/hunian-gallery.repository.ts');
  const roomDetail = source(
    'backend/api/src/modules/admin-ux-master/admin-ux-room-detail.service.ts',
  );
  const roomList = source('backend/api/src/modules/admin-ux-master/admin-ux-room-v2.service.ts');

  assert.match(controller, /@Controller\('kost-types\/:kostTypeId\/content'\)/);
  assert.match(controller, /@Controller\('property-policy-documents'\)/);
  assert.match(controller, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(controller, /@RequirePermissions\('room\.manage'\)/);
  assert.match(galleryController, /acceptsAdminUxV2/);
  assert.match(galleryController, /this\.idempotencyKey\(request\)/);
  assert.match(publicController, /@Get\(':slug\/content'\)/);
  assert.match(publicService, /publicProjection/);

  for (const text of [publication, gallery]) {
    assert.match(text, /this\.database\.transaction/);
    assert.match(text, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(text, /await this\.audit\.write\(/);
    assert.match(text, /client,/);
    assert.match(text, /UPDATE idempotency_commands/);
  }
  assert.match(publication, /PROPERTY_POLICY_FUTURE_CONFLICT/);
  assert.match(publication, /CATEGORY_CONTENT_FUTURE_CONFLICT/);
  assert.match(publication, /GALLERY_COVER_AUTHORITY_INVALID/);
  assert.match(publication, /internal_operating_policy/);
  const publicProjection = publication.slice(
    publication.indexOf('async publicProjection'),
    publication.indexOf('private async categoryWorkspaceWithClient'),
  );
  assert.doesNotMatch(publicProjection, /internal_content|internal_operating_policy/);
  assert.match(publicProjection, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(publicProjection, /publication_status = 'published'/);
  assert.match(
    publicProjection,
    /effective_date <= \(CURRENT_TIMESTAMP AT TIME ZONE 'Asia\/Jakarta'\)::date/,
  );
  assert.match(repository, /kost_type_content_versions/);
  assert.match(repository, /public_derivative_file_id/);
  const publicGalleryLookup = repository.slice(
    repository.indexOf('async findPublicWithFile'),
    repository.indexOf('private map('),
  );
  assert.match(publicGalleryLookup, /publication_status = 'published'/);
  assert.match(
    publicGalleryLookup,
    /effective_date <= \(CURRENT_TIMESTAMP AT TIME ZONE 'Asia\/Jakarta'\)::date/,
  );
  assert.match(
    publicGalleryLookup,
    /JOIN files ON files\.id = \(published_item\.item ->> 'public_derivative_file_id'\)::uuid/,
  );
  assert.match(publicGalleryLookup, /item ->> 'source_file_id' = hgi\.file_id::text/);
  assert.match(publicGalleryLookup, /jsonb_object_length\(item\)/);
  assert.match(repository, /result\.rows\.length !== 1/);
  assert.doesNotMatch(publicGalleryLookup, /files\.id = hgi\.public_derivative_file_id/);
  assert.match(roomDetail, /kost_type_content_facilities/);
  assert.match(roomList, /kost_type_content_facilities/);
  assert.doesNotMatch(roomDetail, /kost_type_facility_assignments/);
});

test('mutation proof rejects obsolete taxonomy, hard delete, unsafe public data, and weak locking', () => {
  const dto = source('backend/api/src/modules/admin-ux-master/admin-ux-gallery-v2.dto.ts');
  const gallery = source('backend/api/src/modules/admin-ux-master/admin-ux-gallery-v2.service.ts');
  const publication = source(
    'backend/api/src/modules/admin-ux-master/admin-ux-content-publication.service.ts',
  );
  const migration = source(migrationPath);

  const assertGalleryContract = (value: string) => {
    assert.doesNotMatch(value, /common_area_key|@IsIn\(\['kost_type', 'common_area'\]\)/);
    assert.doesNotMatch(value, /public_visible!:/);
    assert.match(value, /public_derivative_file_id/);
  };
  assertGalleryContract(dto);
  assert.throws(() =>
    assertGalleryContract(
      dto.replace("@IsIn(['kost_type'])", "@IsIn(['kost_type', 'common_area'])"),
    ),
  );
  assert.doesNotMatch(gallery, /DELETE FROM hunian_gallery_images/);
  assert.match(gallery, /content_state = 'archived'/);
  assert.match(gallery, /FOR UPDATE/);
  assert.match(publication, /FOR UPDATE OF image/);
  assert.match(publication, /FOR UPDATE/);
  assert.match(migration, /UNIQUE \(kost_type_id, content_type, effective_date\)/);
  assert.match(migration, /uq_property_policy_documents_effective/);

  const assertNoUnsafePublicProjection = (value: string) => {
    const projection = value.slice(
      value.indexOf('async publicProjection'),
      value.indexOf('private async categoryWorkspaceWithClient'),
    );
    assert.doesNotMatch(projection, /internal_content|storage_path|source_file_id|metadata/);
  };
  assertNoUnsafePublicProjection(publication);
  assert.throws(() =>
    assertNoUnsafePublicProjection(
      publication.replace(
        'category_label: CATEGORY_LABEL[category],',
        'category_label: CATEGORY_LABEL[category], internal_content: terms.rows[0].internal_content,',
      ),
    ),
  );
});
