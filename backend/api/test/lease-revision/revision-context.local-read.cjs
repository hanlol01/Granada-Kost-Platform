// Read-only source/schema proof. No migration, fixture, or production access.
require('reflect-metadata');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { LeaseRepository } = require('../../dist/modules/lease/lease.repository');
const {
  LeaseRevisionContextService,
} = require('../../dist/modules/lease/lease-revision-context.service');

async function main() {
  assert.equal(process.env.KOSTATION_REVISION_LOCAL_READ, '1', 'Explicit local opt-in required');
  const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'granada_kost',
      };
  const host = config.connectionString ? new URL(config.connectionString).hostname : config.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Loopback database only');
  const pool = new Pool({ ...config, statement_timeout: 10000, connectionTimeoutMillis: 5000 });
  try {
    const { rows: ledger } = await pool.query(
      'SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version DESC LIMIT 1',
    );
    assert.ok(ledger.length, 'Local migration ledger required');
    assert.equal(
      ledger[0].version,
      '114_check_in_anchored_lease_period.sql',
      'Re-audit newer schema before relying on this proof',
    );
    const { rows } = await pool.query(`WITH candidates AS (
      SELECT id,property_id,commercial_mode,lease_status,service_period_state,
        row_number() OVER(PARTITION BY commercial_mode,lease_status,service_period_state ORDER BY created_at DESC) AS sample
      FROM leases
    ) SELECT * FROM candidates WHERE sample<=3 ORDER BY commercial_mode,lease_status`);
    assert.ok(rows.length, 'Local read fixtures required');
    const contextSource = require('node:fs').readFileSync(
      require('node:path').resolve('src/modules/lease/lease-revision-context.service.ts'),
      'utf8',
    );
    const paymentScopeSql = contextSource.match(
      /`WITH revision_financial_facts AS \(([\s\S]*?)\) SELECT/,
    )?.[1];
    assert.ok(paymentScopeSql, 'Locate the actual scoped-payment query');
    const { rows: scoped } = await pool.query(
      `WITH
      leases(id,property_id,occupancy_id) AS (VALUES($1::uuid,$2::uuid,$3::uuid)),
      invoices(id,property_id,lease_id,occupancy_id) AS (VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001'::uuid,$2::uuid,NULL::uuid,$3::uuid),
        ('aaaaaaaa-0000-4000-8000-000000000002'::uuid,$2::uuid,'bbbbbbbb-0000-4000-8000-000000000001'::uuid,$3::uuid)),
      payment_allocations(payment_id,invoice_id,lease_id) AS (VALUES
        ('cccccccc-0000-4000-8000-000000000001'::uuid,'aaaaaaaa-0000-4000-8000-000000000001'::uuid,NULL::uuid),
        ('cccccccc-0000-4000-8000-000000000002'::uuid,'aaaaaaaa-0000-4000-8000-000000000001'::uuid,NULL::uuid),
        ('cccccccc-0000-4000-8000-000000000003'::uuid,'aaaaaaaa-0000-4000-8000-000000000002'::uuid,NULL::uuid),
        ('cccccccc-0000-4000-8000-000000000004'::uuid,'aaaaaaaa-0000-4000-8000-000000000002'::uuid,$1::uuid),
        ('cccccccc-0000-4000-8000-000000000004'::uuid,'aaaaaaaa-0000-4000-8000-000000000002'::uuid,$1::uuid)),
      payments(id,property_id,lease_id,amount,payment_status) AS (VALUES
        ('cccccccc-0000-4000-8000-000000000001'::uuid,$2::uuid,NULL::uuid,1000,'verified'),
        ('cccccccc-0000-4000-8000-000000000002'::uuid,'dddddddd-0000-4000-8000-000000000001'::uuid,NULL::uuid,1000,'verified'),
        ('cccccccc-0000-4000-8000-000000000003'::uuid,$2::uuid,'bbbbbbbb-0000-4000-8000-000000000001'::uuid,1000,'verified'),
        ('cccccccc-0000-4000-8000-000000000004'::uuid,$2::uuid,$1::uuid,500,'verified')),
      revision_financial_facts AS (${paymentScopeSql})
      SELECT count(*)::int AS count,sum(amount)::int AS amount FROM revision_financial_facts`,
      [rows[0].id, rows[0].property_id, require('node:crypto').randomUUID()],
    );
    assert.equal(
      scoped[0].count,
      2,
      'Include the legacy occupancy payment and direct lease payment exactly once; exclude other property/lease',
    );
    assert.equal(scoped[0].amount, 1500);
    const repository = new LeaseRepository({ client: pool });
    const service = new LeaseRevisionContextService(repository);
    const seen = new Set();
    for (const lease of rows) {
      const result = await service.get(
        { roles: ['admin'], permissions: ['lease.manage'], propertyIds: [lease.property_id] },
        lease.id,
      );
      assert.equal(result.data.lease.id, lease.id);
      assert.equal(result.data.lease.commercial_mode, lease.commercial_mode);
      assert.ok(Number.isSafeInteger(result.data.financial.related_transaction_count));
      assert.ok(Number.isSafeInteger(result.data.financial.verified_payment_amount));
      if (result.data.lease.service_period_state === 'pending_check_in') {
        assert.equal(result.data.lease.effective_start_date, null);
        assert.equal(result.data.lease.effective_end_date, null);
      }
      seen.add(lease.commercial_mode);
    }
    const sponsored = rows.find((lease) => lease.commercial_mode === 'owner_sponsored');
    assert.ok(sponsored, 'Sponsored fixtures required for the sponsored-policy SQL proof');
    const source = require('node:fs').readFileSync(
      require('node:path').resolve('src/modules/lease/lease-data-correction.service.ts'),
      'utf8',
    );
    const update = source.match(/`(UPDATE owner_sponsored_lease_terms term[\s\S]*?)`/)?.[1];
    assert.ok(update, 'Locate the actual sponsored projection UPDATE');
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      // EXPLAIN without ANALYZE checks the actual write SQL but never executes it.
      await client.query(`EXPLAIN ${update}`, [sponsored.id, sponsored.property_id]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    console.log(
      JSON.stringify({
        ledger: ledger[0].version,
        contexts_verified: rows.length,
        commercial_modes: [...seen],
        mode: 'read-only',
        mutations: 0,
      }),
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  // Do not print credentials, connection strings, or actual resident data.
  console.error(
    error.code === '42703' || error.code === 'ERR_ASSERTION'
      ? error.message.split('\n')[0]
      : error.code || error.message,
  );
  process.exitCode = 1;
});
