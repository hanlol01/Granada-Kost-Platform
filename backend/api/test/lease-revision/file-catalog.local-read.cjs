// Bounded, read-only local catalogue proof. No schema, data or filesystem mutation.
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { Pool } = require('pg');

async function main() {
  assert.equal(process.env.KOSTATION_REVISION_LOCAL_READ, '1');
  assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV));
  const config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'granada_kost',
  };
  const host = config.connectionString ? new URL(config.connectionString).hostname : config.host;
  const name = config.connectionString ? new URL(config.connectionString).pathname.slice(1) : config.database;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host));
  assert.ok(!/(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i.test(name));
  const pool = new Pool({ ...config, statement_timeout: 10000, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const ledger = (await client.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).rows;
    const references = (await client.query(`SELECT namespace.nspname AS schema,table_row.relname AS table,column_row.attname AS column,
      pg_get_constraintdef(fk.oid) AS definition
      FROM pg_constraint fk JOIN pg_class table_row ON table_row.oid=fk.conrelid
      JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
      JOIN pg_attribute column_row ON column_row.attrelid=table_row.oid AND column_row.attnum=ANY(fk.conkey)
      WHERE fk.contype='f' AND fk.confrelid=to_regclass('public.files') ORDER BY 1,2,3`)).rows;
    const untyped = (await client.query(`SELECT table_name,column_name,data_type,udt_name FROM information_schema.columns
      WHERE table_schema='public' AND ((data_type='ARRAY' AND udt_name='_uuid')
        OR data_type IN ('json','jsonb') OR column_name ILIKE '%file%') ORDER BY table_name,column_name`)).rows;
    const drivers = (await client.query('SELECT storage_driver,count(*)::int AS n FROM files GROUP BY storage_driver')).rows;
    const duplicatePaths = (await client.query(`SELECT count(*)::int AS n FROM
      (SELECT storage_driver,storage_path FROM files GROUP BY storage_driver,storage_path HAVING count(*)>1) duplicated`)).rows[0].n;
    const clones = (await client.query("SELECT datname FROM pg_database WHERE datname ~ '^kostation_h08_revision_[a-f0-9]{12}_m1_qa$' ORDER BY datname")).rows;
    console.log(JSON.stringify({ ledger, references, untyped, drivers, duplicatePaths, disposableCloneInventory: clones, mode: 'read-only' }, null, 2));
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
}
main().catch(error => { console.error(`File catalogue proof failed: ${error.code || error.name}`); process.exitCode=1; });
