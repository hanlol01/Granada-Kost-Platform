// Read-only verification against the explicitly selected local database.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { FileRepository } = require('../../dist/modules/file/file.repository');
const {
  explicitDatabaseConfigFromEnv,
} = require('../../dist/infrastructure/database/scripts/database-url');

async function verify() {
  const config = explicitDatabaseConfigFromEnv();
  const hostname = config.connectionString
    ? new URL(config.connectionString).hostname
    : config.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(hostname), 'This check is local-only');
  const client = new Client(config);
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const repository = new FileRepository({ client });
    const sample = await client.query(`SELECT id FROM (
      SELECT id,row_number() OVER (PARTITION BY file_purpose ORDER BY created_at DESC,id) AS n
        FROM files WHERE is_deleted=false
    ) f WHERE n<=3 LIMIT 36`);
    const contexts = [];
    for (const { id } of sample.rows) {
      const record = await repository.findById(id);
      const context = await repository.downloadContext(record);
      assert.ok(context.label && context.code);
      assert.match(context.sequence, /^\d+$/);
      contexts.push(
        `${context.label}-${context.code}-${context.sequence.padStart(2, '0')}.${record.fileExtension}`,
      );
    }
    console.log(
      `Validated ${contexts.length} existing file download contexts in a read-only transaction.`,
    );
    console.log([...new Set(contexts)].join('\n'));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
