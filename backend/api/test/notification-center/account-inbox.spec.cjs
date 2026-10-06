require('./register-typescript.cjs');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const {
  AccountNotificationCenterRepository,
} = require('../../src/modules/notification/repositories/account-notification-center.repository.ts');
const {
  AccountNotificationCenterService,
} = require('../../src/modules/notification/services/account-notification-center.service.ts');
const {
  MIGRATION_MANIFEST,
} = require('../../src/infrastructure/database/scripts/migration-manifest.ts');
const { checksumMatchesManifest } = require('../../src/infrastructure/database/scripts/migrate.ts');
const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = (role = 'admin', id = uuid(1)) => ({
  id,
  email: null,
  phone: null,
  displayName: 'Test',
  roles: [role],
  permissions: ['notification.manage'],
  propertyIds: [uuid(10)],
  sessionId: 'test',
});

test('Admin scope requires property permission; Owner derives self scope without property membership', async () => {
  const calls = [];
  const repo = {
    list: async (scope, query) => {
      calls.push({ scope, query });
      return {
        records: [],
        total: 0,
        unreadCount: 14,
        availableCategories: ['payments'],
        availableAssets: [],
      };
    },
  };
  const properties = {
    get: async (user, id) => {
      if (!user.propertyIds.includes(id)) throw new Error('property denied');
    },
  };
  const service = new AccountNotificationCenterService(repo, properties, { write: async () => {} });
  await assert.rejects(service.list(actor(), {}), /property_id is required/);
  await assert.rejects(service.list(actor(), { property_id: uuid(11) }), /property denied/);
  await assert.rejects(
    service.list({ ...actor(), permissions: [] }, { property_id: uuid(10) }),
    /access denied/,
  );
  const response = await service.list(
    { ...actor('property_owner'), propertyIds: [] },
    { limit: 10 },
  );
  assert.equal(response.unreadCount, 14);
  assert.equal(calls[0].scope.audience, 'property_owner');
  assert.equal(calls[0].scope.userId, uuid(1));
  await service.list(
    { ...actor('property_owner'), roles: ['admin', 'property_owner'] },
    { property_id: uuid(10) },
  );
  assert.equal(calls[1].scope.audience, 'admin');
});

test('Owner response omits resident private content and raw URL metadata; safe finance link carries exact ids', async () => {
  const row = {
    id: uuid(80),
    property_id: uuid(10),
    notification_type: 'property_owner.transfer.verified',
    source_event_type: 'property_owner.transfer.verified',
    source_resource_id: uuid(81),
    category: 'transfer',
    title: 'Resident Private Name',
    body: 'Phone +628123 email private@test',
    priority: 'normal',
    status: 'unread',
    created_at: new Date(),
    read_at: null,
    expires_at: null,
    room_code: 'AK0503',
    realization_id: uuid(82),
    realization_reference: 'RLS-001',
    historical: false,
    metadata: {
      relatedHref: 'https://evil.test',
      resident_name: 'Private Name',
      amount: '1500000',
      period: '2026-07',
      superseded_by: uuid(83),
    },
  };
  const repo = {
    list: async () => ({
      records: [row],
      total: 1,
      unreadCount: 1,
      availableCategories: ['transfer'],
      availableAssets: ['AK0503'],
    }),
  };
  const service = new AccountNotificationCenterService(
    repo,
    { get: async () => {} },
    { write: async () => {} },
  );
  const response = await service.list(actor('property_owner'), {});
  const item = response.items[0];
  assert.doesNotMatch(JSON.stringify(response), /Private Name|628123|private@test|evil/);
  assert.equal(
    item.relatedHref,
    `/property-owners/portal/reports?realizationId=${uuid(82)}&transferId=${uuid(81)}`,
  );
  assert.match(item.body, /Rp1\.500\.000/);
  assert.match(item.body, /2026-07/);
  assert.equal(item.superseded, true);
});

test('Migration checksum matches runner manifest and preserves recipient legacy state only', () => {
  const file = readFileSync(
    resolve(
      __dirname,
      '../../src/infrastructure/database/migrations/125_account_notification_inbox.sql',
    ),
    'utf8',
  );
  const hash = require('node:crypto').createHash('sha256').update(file).digest('hex');
  assert.equal(
    MIGRATION_MANIFEST.find((e) => e.version === '125_account_notification_inbox.sql')
      .checksumSha256,
    hash,
  );
  assert.match(file, /SELECT id, recipient_user_id, notification_status/);
  assert.doesNotMatch(file, /DELETE FROM|UPDATE notifications/);
});

test('the migration runner accepts only the exact reconciled 122–123 sources', async () => {
  const { loadMigrationSources } = require('../../src/infrastructure/database/scripts/migrate.ts');
  const sources = (await loadMigrationSources()).filter((entry) =>
    [
      '122_owner_earning_candidate_authority.sql',
      '123_owner_earning_effective_service_period.sql',
    ].includes(entry.version),
  );
  assert.equal(sources.length, 2);
  assert.equal(sources.every(checksumMatchesManifest), true);
  assert.equal(
    checksumMatchesManifest({
      ...sources[0],
      rawBytes: Buffer.from('untrusted migration source'),
      sql: 'untrusted migration source',
    }),
    false,
  );
});

test(
  'PostgreSQL isolated rollback proof: authorization, ownership, dedupe, counts, bulk and archive lifecycle',
  { skip: process.env.NOTIFICATION_INBOX_LOCAL_ROLLBACK_PROOF !== 'true' },
  async () => {
    require('dotenv').config({ path: resolve(__dirname, '../../.env'), quiet: true });
    assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV), 'Development only');
    const {
      databaseConfigFromEnv,
    } = require('../../src/infrastructure/database/scripts/database-url.ts');
    const config = databaseConfigFromEnv();
    const url = config.connectionString ? new URL(config.connectionString) : null;
    const hostname = url?.hostname ?? config.host;
    const database = url ? decodeURIComponent(url.pathname.slice(1)) : config.database;
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(hostname), 'Loopback only');
    assert.doesNotMatch(database, /(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i);
    const pool = new Pool({ ...config, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
    const client = await pool.connect();
    const schema = `notification_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},pg_catalog`);
      await client.query(`
      CREATE TABLE users(id uuid PRIMARY KEY,user_status text DEFAULT 'active');
      CREATE TABLE properties(id uuid PRIMARY KEY);
      CREATE TABLE business_events(id uuid PRIMARY KEY);
      CREATE TABLE roles(id uuid PRIMARY KEY,code text);
      CREATE TABLE user_property_roles(user_id uuid,property_id uuid,role_id uuid,revoked_at timestamptz);
      CREATE TABLE property_owner_profiles(id uuid PRIMARY KEY,property_id uuid,user_id uuid,profile_status text DEFAULT 'active');
      CREATE TABLE rooms(id uuid PRIMARY KEY,property_id uuid,building_id uuid,room_code text);
      CREATE TABLE building_owner_assignments(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,building_id uuid,effective_from date,effective_until date,assignment_status text);
      CREATE TABLE room_owner_assignments(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,room_id uuid,effective_from date,effective_until date,assignment_status text);
      CREATE TABLE complaints(id uuid PRIMARY KEY,property_id uuid,room_id uuid);
      CREATE TABLE maintenance_work_orders(id uuid PRIMARY KEY,property_id uuid,room_id uuid);
      CREATE TABLE occupancies(id uuid PRIMARY KEY,property_id uuid,room_id uuid);
      CREATE TABLE leases(id uuid PRIMARY KEY,property_id uuid,room_id uuid);
      CREATE TABLE lease_checkout_commands(id uuid PRIMARY KEY,property_id uuid,room_id uuid,lease_id uuid);
      CREATE TABLE payments(id uuid PRIMARY KEY,property_id uuid,lease_id uuid);
      CREATE TABLE invoices(id uuid PRIMARY KEY,property_id uuid,room_id uuid);
      CREATE TABLE property_owner_earnings(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,room_id uuid,ownership_kind text,ownership_assignment_id uuid,service_from date,service_until date);
      CREATE TABLE property_owner_settlements(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid);
      CREATE TABLE property_owner_settlement_publications(settlement_id uuid,publication_status text);
      CREATE TABLE property_owner_settlement_lines(settlement_id uuid,earning_id uuid);
      CREATE TABLE property_owner_payouts(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,settlement_id uuid);
      CREATE TABLE property_owner_earning_adjustments(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,settlement_id uuid,earning_id uuid,adjustment_status text);
      CREATE TABLE property_owner_realizations(id uuid PRIMARY KEY,property_id uuid,owner_profile_id uuid,published_at timestamptz,realization_reference text);
      CREATE TABLE property_owner_realization_lines(realization_id uuid,room_id uuid);
      CREATE TABLE property_owner_realization_transfers(id uuid PRIMARY KEY,realization_id uuid,property_id uuid);
      CREATE TABLE notifications(id uuid PRIMARY KEY,property_id uuid,recipient_user_id uuid,notification_type text,notification_status text DEFAULT 'unread',
        priority text DEFAULT 'normal',title text DEFAULT 'Event',body text DEFAULT 'Context',metadata jsonb,source_event_type text,source_resource_id uuid,
        correlation_id text,read_at timestamptz,expires_at timestamptz,created_at timestamptz DEFAULT now());
    `);
      await client.query('INSERT INTO properties VALUES($1),($2)', [uuid(10), uuid(11)]);
      for (const id of [1, 2, 3, 4, 5])
        await client.query('INSERT INTO users(id) VALUES($1)', [uuid(id)]);
      await client.query('INSERT INTO roles VALUES($1,$2)', [uuid(9), 'admin']);
      for (const id of [1, 2])
        await client.query('INSERT INTO user_property_roles VALUES($1,$2,$3,NULL)', [
          uuid(id),
          uuid(10),
          uuid(9),
        ]);
      await client.query('INSERT INTO property_owner_profiles VALUES($1,$2,$3,$4)', [
        uuid(20),
        uuid(10),
        uuid(4),
        'active',
      ]);
      for (const [id, code] of [
        [30, 'AK0503'],
        [31, 'AK0504'],
        [32, 'AK0601'],
      ])
        await client.query('INSERT INTO rooms VALUES($1,$2,$3,$4)', [
          uuid(id),
          uuid(10),
          uuid(33),
          code,
        ]);
      await client.query(
        `INSERT INTO room_owner_assignments VALUES($1,$2,$3,$4,current_date-100,NULL,'active'),($5,$2,$3,$6,current_date-100,current_date-1,'released')`,
        [uuid(40), uuid(10), uuid(20), uuid(30), uuid(41), uuid(32)],
      );
      await client.query('INSERT INTO invoices VALUES($1,$2,$3)', [uuid(50), uuid(10), uuid(30)]);
      async function notification(id, user, type, resource, extra = {}) {
        await client.query(
          `INSERT INTO notifications(id,property_id,recipient_user_id,notification_type,source_event_type,source_resource_id,metadata,expires_at,created_at,notification_status,read_at)
        VALUES($1,$2,$3,$4,$4,$5,$6::jsonb,$7,COALESCE($8::timestamptz,now()),$9,$10)`,
          [
            uuid(id),
            extra.property ?? uuid(10),
            uuid(user),
            type,
            resource ? uuid(resource) : null,
            JSON.stringify(extra.metadata ?? {}),
            extra.expires ?? null,
            extra.created ?? null,
            extra.status ?? 'unread',
            extra.readAt ?? null,
          ],
        );
      }
      await notification(60, 1, 'billing.review', 50, { metadata: { event_key: 'review-1' } });
      await notification(61, 2, 'billing.review', 50, { metadata: { event_key: 'review-1' } });
      await notification(62, 3, 'billing.due', 50);
      await notification(63, 2, 'billing.other-property', 50, { property: uuid(11) });
      await notification(64, 3, 'announce.published', null);
      await notification(65, 3, 'billing.expired', 50, {
        expires: new Date(Date.now() - 86400000),
      });
      await notification(66, 3, 'billing.legacy-read', 50, { status: 'read', readAt: new Date() });
      await notification(70, 4, 'room.ready', 30);
      await notification(71, 4, 'room.maintenance', 31, { metadata: { room_id: uuid(30) } });
      await notification(72, 4, 'room.ready', 32, {
        created: new Date(Date.now() - 10 * 86400000),
      });
      await notification(73, 4, 'room.ready', 32);
      await client.query(
        'INSERT INTO property_owner_realizations VALUES($1,$2,$3,now(),$4),($5,$2,$3,NULL,$6)',
        [uuid(80), uuid(10), uuid(20), 'RLS-001', uuid(81), 'DRAFT'],
      );
      await client.query('INSERT INTO property_owner_realization_lines VALUES($1,$2)', [
        uuid(80),
        uuid(30),
      ]);
      await notification(74, 4, 'property_owner.realization.published', 80, {
        metadata: { period: '2026-07', amount: '1500000' },
      });
      await notification(75, 4, 'property_owner.realization.published', 81);
      const migration = readFileSync(
        resolve(
          __dirname,
          '../../src/infrastructure/database/migrations/125_account_notification_inbox.sql',
        ),
        'utf8',
      ).replace(/^BEGIN;|^COMMIT;/gm, '');
      await client.query(migration);
      const repo = new AccountNotificationCenterRepository({ client });
      const adminA = { userId: uuid(1), audience: 'admin', propertyId: uuid(10) };
      const adminB = { userId: uuid(2), audience: 'admin', propertyId: uuid(10) };
      const resident = { userId: uuid(3), audience: 'resident' };
      const owner = { userId: uuid(4), audience: 'property_owner' };
      let page = await repo.list(adminA, { limit: 1, offset: 0 });
      assert.equal(page.total, 1);
      assert.equal(page.unreadCount, 1);
      assert.equal(page.records.length, 1);
      assert.equal((await repo.mutate(adminA, 'read', uuid(60))).length, 1);
      assert.equal((await repo.list(adminA, {})).unreadCount, 0);
      assert.equal((await repo.list(adminB, {})).unreadCount, 1, 'Admin A must not affect Admin B');
      assert.equal(
        (await repo.list(resident, {})).unreadCount,
        1,
        'No announcements or expired unread',
      );
      assert.equal(
        (
          await client.query('SELECT notification_status FROM notifications WHERE id=$1', [
            uuid(60),
          ])
        ).rows[0].notification_status,
        'unread',
      );
      await repo.mutate(adminA, 'archive', uuid(60));
      await repo.mutate(adminA, 'read', uuid(60));
      assert.equal((await repo.find(adminA, uuid(60))).status, 'archived');
      assert.equal((await repo.mutate(adminB, 'read-all')).length, 1);
      assert.equal((await repo.mutate(adminB, 'archive-read')).length, 1);
      assert.equal((await repo.list(adminB, { status: 'archived' })).total, 1);
      assert.equal(
        (await repo.mutate(adminA, 'read', uuid(62))).length,
        0,
        'Other recipient private inbox denied',
      );
      page = await repo.list(resident, { status: 'active', limit: 1, offset: 1, search: 'Event' });
      assert.equal(page.total, 2);
      assert.equal(page.records.length, 1);
      assert.equal(page.unreadCount, 1);
      await repo.mutate(resident, 'read-all');
      assert.equal((await repo.list(resident, {})).unreadCount, 0);
      assert.equal(
        (await repo.find(resident, uuid(65))).status,
        'unread',
        'Expired unread stays untouched',
      );
      await repo.mutate(resident, 'archive', uuid(65));
      assert.equal(
        (await repo.list(resident, { status: 'archived' })).total,
        1,
        'Expired archived stays searchable',
      );
      page = await repo.list(owner, { status: 'active' });
      assert.deepEqual(
        page.records.map((r) => r.id).sort(),
        [uuid(70), uuid(72), uuid(74)].sort(),
        'Owner current/history only; forged metadata and unpublished finance denied',
      );
      assert.deepEqual(page.availableAssets, ['AK0503', 'AK0601']);
      page = await repo.list(owner, { status: 'active', period: '2026-07', asset: 'AK0503' });
      assert.equal(page.total, 1);
      assert.equal(page.unreadCount, 3, 'Count does not inherit period/asset filters');
      assert.equal((await repo.find(owner, uuid(72))).historical, true);
      assert.equal((await repo.mutate(owner, 'read-all')).length, 3);
      assert.equal((await repo.list(owner, {})).unreadCount, 0);
      assert.equal(
        (await client.query('SELECT count(*)::int AS count FROM notifications')).rows[0].count,
        13,
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
      const exists = await pool.query(
        'SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists',
        [schema],
      );
      assert.equal(exists.rows[0].exists, false, 'Test schema must not survive rollback');
      await pool.end();
    }
  },
);
