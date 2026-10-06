// Explicit local-only proof against a freshly created disposable clone. No
// production connection, application restart, real file write or source DB mutation.
require('./register-typescript.cjs');
// Literal CLI opt-in keeps the command visible to shell safety tooling.
if (process.argv.includes('--disposable-local-only')) process.env.KOSTATION_REVISION_DISPOSABLE = '1';
const proofArgument = process.argv.find(value => /^--proof=(cancellation|restoration|files|runtime|http)$/.test(value));
if (proofArgument) process.env.KOSTATION_REVISION_PROOF = proofArgument.slice('--proof='.length);
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const {
  runMigrations,
  loadMigrationSources,
} = require('../../src/infrastructure/database/scripts/migrate.ts');
const {
  LeaseRoomRecordingCorrectionService,
} = require('../../src/modules/lease/lease-room-recording-correction.service.ts');
const { FileRepository } = require('../../src/modules/file/file.repository.ts');
const { runSponsorshipCorrectionProof } = require('./sponsorship-correction.disposable.cjs');
const { runCommercialModeCorrectionProof } = require('./commercial-mode.disposable.cjs');
const { runCombinedRoomSponsorshipProof } = require('./combined-room-sponsorship.disposable.cjs');
const { runCancellationProof } = require('./cancellation.disposable.cjs');
const { runRestorationProof } = require('./archive-restoration.disposable.cjs');
const { runArchiveFilePurgeProof } = require('./file-purge.disposable.cjs');
const {
  disposableDatabaseTargetFromEnv,
  assertDisposableDatabaseConnection,
} = require('../../src/infrastructure/database/scripts/admin-ux-m1/disposable-database.ts');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const protectedTables = [
  'residents',
  'leases',
  'rooms',
  'occupancies',
  'onboarding_commitments',
  'booking_lead_holds',
  'payments',
  'invoices',
  'payment_receipts',
  'owner_sponsored_lease_terms',
  'property_owner_realizations',
];
async function fingerprints(pool, tables = protectedTables) {
  const values = {};
  for (const table of tables) {
    assert.ok(protectedTables.includes(table));
    const result = await pool.query(
      `SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb)::text AS content FROM ${table} row`,
    );
    values[table] = hash(result.rows[0].content);
  }
  return values;
}
async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function insertCorrection(client, lease, actorId) {
  const correctionId = randomUUID();
  await client.query(
    `INSERT INTO lease_data_corrections(id,property_id,lease_id,sequence_number,correction_kind,
    previous_snapshot,corrected_snapshot,reason,created_by_user_id,command_fingerprint,request_fingerprint)
    SELECT $1,$2,$3,COALESCE(max(sequence_number),0)+1,'combined','{}','{}','Disposable room correction proof',$4,$5,$6
    FROM lease_data_corrections WHERE lease_id=$3`,
    [correctionId, lease.property_id, lease.id, actorId, hash(randomUUID()), hash(randomUUID())],
  );
  return correctionId;
}
async function insertFile(client, propertyId, actorId, purpose = 'lease_revision_evidence') {
  const id = randomUUID();
  await client.query(
    `INSERT INTO files(id,property_id,uploader_user_id,original_filename,sanitized_filename,
    mime_type,file_extension,file_size_bytes,file_purpose,storage_driver,storage_path,checksum_sha256)
    VALUES($1,$2,$3,'proof.pdf','proof.pdf','application/pdf','pdf',100,$4,'local',$5,$6)`,
    [id, propertyId, actorId, purpose, `disposable-only/${id}.pdf`, hash('No real bytes written')],
  );
  return id;
}
async function attach(client, lease, correctionId, fileId, actorId) {
  return client.query(
    `INSERT INTO lease_data_correction_evidence(property_id,lease_id,correction_id,file_id,created_by_user_id)
    VALUES($1,$2,$3,$4,$5)`,
    [lease.property_id, lease.id, correctionId, fileId, actorId],
  );
}
async function main() {
  assert.equal(
    process.env.KOSTATION_REVISION_DISPOSABLE,
    '1',
    'Explicit disposable opt-in required',
  );
  assert.ok(!['production', 'staging'].includes(process.env.NODE_ENV), 'Development only');
  const sourceUrl = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL)
    : new URL('postgresql://localhost');
  if (!process.env.DATABASE_URL) {
    sourceUrl.hostname = process.env.DB_HOST || 'localhost';
    sourceUrl.port = process.env.DB_PORT || '5432';
    sourceUrl.username = process.env.DB_USER || 'postgres';
    sourceUrl.password = process.env.DB_PASSWORD || '';
    sourceUrl.pathname = `/${process.env.DB_NAME || 'granada_kost'}`;
  }
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname),
    'Loopback source only',
  );
  const sourceDatabase = decodeURIComponent(sourceUrl.pathname.slice(1));
  assert.ok(
    sourceDatabase &&
      !/(^|[._-])(prod(?:uction)?|stage|staging|live)([._-]|$)/i.test(sourceDatabase),
    'Refuse production-like source',
  );
  const database = `kostation_h08_revision_${randomBytes(6).toString('hex')}_m1_qa`;
  const namePattern = /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/;
  assert.match(database, namePattern);
  assert.notEqual(database, sourceDatabase);
  const targetUrl = new URL(sourceUrl.href);
  targetUrl.pathname = `/${database}`;
  const target = disposableDatabaseTargetFromEnv({
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: targetUrl.href,
    ADMIN_UX_QA_DISPOSABLE: 'true',
  });
  const source = new Pool({
    connectionString: sourceUrl.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  const pool = new Pool({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    max: 4,
  });
  let created = false;
  try {
    const initialLedger = (
      await source.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version')
    ).rows;
    assert.equal(
      initialLedger.at(-1).version,
      '114_check_in_anchored_lease_period.sql',
      'Re-audit changed source ledger before cloning',
    );
    const initialSource = await fingerprints(source);
    await source.query(`CREATE DATABASE "${database}"`);
    created = true;
    await assertDisposableDatabaseConnection(pool, target);
    const pgEnv = {
      ...process.env,
      PGHOST: sourceUrl.hostname.replace(/^\[|\]$/g, ''),
      PGPORT: sourceUrl.port || '5432',
      PGUSER: decodeURIComponent(sourceUrl.username),
      PGPASSWORD: decodeURIComponent(sourceUrl.password),
    };
    const dump = spawnSync(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--dbname', sourceDatabase],
      { env: pgEnv, timeout: 60000, maxBuffer: 256 * 1024 * 1024 },
    );
    assert.equal(dump.status, 0, 'Local dump failed; credentials/output intentionally not printed');
    const restore = spawnSync(
      'pg_restore',
      ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', database],
      { env: pgEnv, input: dump.stdout, timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(restore.status, 0, 'Disposable restore failed; source stays unchanged');
    await assertDisposableDatabaseConnection(pool, target);
    const baseline = await fingerprints(pool);
    const sources = await loadMigrationSources();
    const migration = sources.find(
      (source) => source.version === '115_lease_correction_room_evidence.sql',
    );
    assert.equal(migration.version, '115_lease_correction_room_evidence.sql');
    assert.equal(hash(migration.rawBytes), migration.checksumSha256);

    // Force the official runner to fail after DDL, at its ledger append. Verify
    // PostgreSQL rolls back both schema and ledger rather than forging a result.
    await pool.query(`CREATE FUNCTION h08_proof_reject_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.version='115_lease_correction_room_evidence.sql' THEN RAISE EXCEPTION 'H08_PROOF_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER h08_proof_reject_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_ledger()`);
    const migrationClient = await pool.connect();
    try {
      await assert.rejects(runMigrations(migrationClient, sources), /H08_PROOF_FAILURE/);
      assert.equal(
        (await pool.query("SELECT to_regclass('public.lease_data_correction_evidence') AS present"))
          .rows[0].present,
        null,
      );
      assert.deepEqual(
        (await pool.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version'))
          .rows,
        initialLedger,
      );
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query(
        'DROP TRIGGER h08_proof_reject_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_ledger()',
      );
      const policyMigration = sources.find(
        (source) => source.version === '116_owner_sponsored_policy_revisions.sql',
      );
      assert.equal(policyMigration.version, '116_owner_sponsored_policy_revisions.sql');
      assert.equal(hash(policyMigration.rawBytes), policyMigration.checksumSha256);
      const roomLedger = [
        ...initialLedger,
        { version: migration.version, checksum_sha256: migration.checksumSha256 },
      ];
      await pool.query(`CREATE FUNCTION h08_proof_reject_policy_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='116_owner_sponsored_policy_revisions.sql' THEN RAISE EXCEPTION 'H08_POLICY_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_policy_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_policy_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_POLICY_LEDGER_FAILURE/);
      assert.equal(
        (
          await pool.query(
            `SELECT ${migration.sentinels.map((value) => `(${value})`).join(' AND ')} AS present`,
          )
        ).rows[0].present,
        true,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT to_regclass('public.owner_sponsored_policy_revisions') AS present",
          )
        ).rows[0].present,
        null,
      );
      assert.deepEqual(
        (await pool.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version'))
          .rows,
        roomLedger,
      );
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query(
        'DROP TRIGGER h08_proof_reject_policy_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_policy_ledger()',
      );
      const modeMigration = sources.find(
        (source) => source.version === '117_lease_commercial_mode_corrections.sql',
      );
      assert.equal(hash(modeMigration.rawBytes), modeMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_mode_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='117_lease_commercial_mode_corrections.sql' THEN RAISE EXCEPTION 'H08_MODE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_mode_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_mode_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_MODE_LEDGER_FAILURE/);
      assert.equal(
        (
          await pool.query(
            "SELECT to_regclass('public.lease_commercial_mode_revisions') AS present",
          )
        ).rows[0].present,
        null,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='lease_installments'::regclass AND conname='lease_installments_period_unique'",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT pg_get_expr(indpred,indrelid) NOT ILIKE '%invoice_status%' AS original FROM pg_index WHERE indexrelid='idx_invoices_lease_cycle_start_unique'::regclass",
          )
        ).rows[0].original,
        true,
      );
      assert.deepEqual(
        (await pool.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version'))
          .rows,
        [
          ...roomLedger,
          { version: policyMigration.version, checksum_sha256: policyMigration.checksumSha256 },
        ],
      );
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query(
        'DROP TRIGGER h08_proof_reject_mode_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_mode_ledger()',
      );
      const archiveMigration = sources.find((source) => source.version === '118_lease_cancellation_archive.sql');
      assert.equal(hash(archiveMigration.rawBytes), archiveMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_archive_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='118_lease_cancellation_archive.sql' THEN RAISE EXCEPTION 'H08_ARCHIVE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_archive_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_archive_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_ARCHIVE_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT to_regclass('public.lease_archives') AS present")).rows[0].present, null);
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_archive_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_archive_ledger()');
      const restorationMigration = sources.find(source => source.version === '119_lease_archive_restoration.sql');
      assert.equal(hash(restorationMigration.rawBytes), restorationMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_restore_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='119_lease_archive_restoration.sql' THEN RAISE EXCEPTION 'H08_RESTORE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_restore_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_restore_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_RESTORE_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT to_regclass('public.lease_archive_restore_commands') AS present")).rows[0].present, null);
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_restore_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_restore_ledger()');
      const purgeMigration = sources.find(source => source.version === '120_lease_archive_file_purge.sql');
      assert.equal(hash(purgeMigration.rawBytes), purgeMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_purge_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='120_lease_archive_file_purge.sql' THEN RAISE EXCEPTION 'H08_PURGE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_purge_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_purge_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_PURGE_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT to_regclass('public.lease_file_purge_items') AS present")).rows[0].present, null);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='files' AND column_name='archive_purge_command_id'")).rows[0].n, 0);
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_purge_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_purge_ledger()');
      const financialMigration = sources.find(source => source.version === '121_lease_revision_financial_projection.sql');
      assert.equal(hash(financialMigration.rawBytes), financialMigration.checksumSha256);
      const viewBefore = (await pool.query("SELECT pg_get_viewdef('resident_admin_lifecycle_projection',true) AS definition")).rows[0].definition;
      await pool.query(`CREATE FUNCTION h08_proof_reject_financial_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='121_lease_revision_financial_projection.sql' THEN RAISE EXCEPTION 'H08_FINANCIAL_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_financial_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_financial_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_FINANCIAL_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT pg_get_viewdef('resident_admin_lifecycle_projection',true) AS definition")).rows[0].definition,viewBefore);
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_financial_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_financial_ledger()');
      const recognitionMigration = sources.find(source => source.version === '122_owner_earning_candidate_authority.sql');
      assert.equal(hash(recognitionMigration.rawBytes), recognitionMigration.checksumSha256);
      const recognitionBefore = (await pool.query("SELECT pg_get_functiondef('recognize_property_owner_rent_earnings(uuid,date)'::regprocedure) AS definition")).rows[0].definition;
      await pool.query(`CREATE FUNCTION h08_proof_reject_recognition_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='122_owner_earning_candidate_authority.sql' THEN RAISE EXCEPTION 'H08_RECOGNITION_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_recognition_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_recognition_ledger()`);
      await assert.rejects(runMigrations(migrationClient, sources), /H08_RECOGNITION_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT pg_get_functiondef('recognize_property_owner_rent_earnings(uuid,date)'::regprocedure) AS definition")).rows[0].definition, recognitionBefore);
      assert.deepEqual(await fingerprints(pool), baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_recognition_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_recognition_ledger()');
      const effectiveMigration=sources.find(source=>source.version==='123_owner_earning_effective_service_period.sql');
      assert.equal(hash(effectiveMigration.rawBytes),effectiveMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_effective_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='123_owner_earning_effective_service_period.sql' THEN RAISE EXCEPTION 'H08_EFFECTIVE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_effective_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_effective_ledger()`);
      await assert.rejects(runMigrations(migrationClient,sources),/H08_EFFECTIVE_LEDGER_FAILURE/);
      const effectiveBefore=(await pool.query(`SELECT pg_get_functiondef('recognize_property_owner_rent_earnings(uuid,date)'::regprocedure) AS recognition,
        pg_get_functiondef('validate_property_owner_earning_authority()'::regprocedure) AS guard`)).rows[0];
      await assert.rejects(runMigrations(migrationClient,sources),/H08_EFFECTIVE_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT to_regclass('public.property_owner_invoice_service_periods') AS present")).rows[0].present,null);
      assert.deepEqual((await pool.query(`SELECT pg_get_functiondef('recognize_property_owner_rent_earnings(uuid,date)'::regprocedure) AS recognition,
        pg_get_functiondef('validate_property_owner_earning_authority()'::regprocedure) AS guard`)).rows[0],effectiveBefore);
      assert.deepEqual(await fingerprints(pool),baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_effective_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_effective_ledger()');
      const chargeMigration=sources.find(source=>source.version==='124_journal_authorized_correction_charges.sql');
      assert.equal(hash(chargeMigration.rawBytes),chargeMigration.checksumSha256);
      await pool.query(`CREATE FUNCTION h08_proof_reject_charge_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.version='124_journal_authorized_correction_charges.sql' THEN RAISE EXCEPTION 'H08_CHARGE_LEDGER_FAILURE'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER h08_proof_reject_charge_ledger BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION h08_proof_reject_charge_ledger()`);
      await assert.rejects(runMigrations(migrationClient,sources),/H08_CHARGE_LEDGER_FAILURE/);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='lease_installments' AND column_name='correction_id'")).rows[0].n,0);
      assert.ok(!(await pool.query("SELECT pg_get_expr(indpred,indrelid) AS predicate FROM pg_index WHERE indexrelid='lease_installments_current_period_unique'::regclass")).rows[0].predicate.includes('correction_id'));
      assert.deepEqual(await fingerprints(pool),baseline);
      await pool.query('DROP TRIGGER h08_proof_reject_charge_ledger ON schema_migrations; DROP FUNCTION h08_proof_reject_charge_ledger()');
      const modeApplied = await runMigrations(migrationClient, sources);
      const modeReplay = await runMigrations(migrationClient, sources);
      assert.equal(modeApplied.applied, 1);
      assert.equal(modeReplay.applied, 0);
      assert.equal((await pool.query(`SELECT ${archiveMigration.sentinels.map((value) => `(${value})`).join(' AND ')} AS present`)).rows[0].present, true);
      assert.equal(
        (
          await pool.query(
            `SELECT ${modeMigration.sentinels.map((value) => `(${value})`).join(' AND ')} AS present`,
          )
        ).rows[0].present,
        true,
      );
      assert.equal(
        (
          await pool.query(
            `SELECT ${policyMigration.sentinels.map((value) => `(${value})`).join(' AND ')} AS present`,
          )
        ).rows[0].present,
        true,
      );
      assert.deepEqual(await fingerprints(pool), baseline);
      for (const sentinel of restorationMigration.sentinels) {
        assert.equal((await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present, true,
          `Restoration migration sentinel failed: ${sentinel}`);
      }
      for (const sentinel of purgeMigration.sentinels) assert.equal((await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present, true);
      for (const sentinel of financialMigration.sentinels) assert.equal((await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present, true);
      for (const sentinel of effectiveMigration.sentinels) assert.equal((await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present, true);
      for (const sentinel of chargeMigration.sentinels) assert.equal((await pool.query(`SELECT (${sentinel}) AS present`)).rows[0].present, true);
      process.stdout.write(
        'Official runner: migrations 115–124 applied, replay=0, checksum/sentinels/each DDL rollback and protected-table fingerprints pass\n',
      );
    } finally {
      migrationClient.release();
    }

    const lease = (
      await pool.query(`SELECT lease.*,lease.start_date::text AS start_text,lease.end_date::text AS end_text,
      resident.gender FROM leases lease JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
      JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
      WHERE lease.lease_status='awaiting_activation' AND lease.commercial_mode='rent' AND lease.occupancy_id IS NULL
        AND room.room_status='reserved'
      ORDER BY lease.created_at DESC LIMIT 1`)
    ).rows[0];
    assert.ok(
      lease,
      'A reserved local lease is required; do not change the source to manufacture one',
    );
    const targetRooms = (
      await pool.query(
        `SELECT target.id FROM rooms target JOIN room_buildings building ON building.id=target.building_id
      JOIN kost_types type ON type.id=target.kost_type_id
      WHERE target.property_id=$1 AND target.room_status='vacant' AND building.gender_policy=$2
        AND target.gender_policy IN ($2,'mixed') AND type.status='active' AND type.deleted_at IS NULL
        AND target.category IN ('rukost','apartkost') AND target.category=type.category AND target.category=building.category
       ORDER BY target.number`,
        [lease.property_id, lease.gender],
      )
    ).rows;
    assert.ok(targetRooms.length, 'A vacant target is required');
    let targetRoom = targetRooms[0];
    const actorId = (await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]
      .id;
    const service = new LeaseRoomRecordingCorrectionService();
    if (['cancellation','restoration','files','runtime','http'].includes(process.env.KOSTATION_REVISION_PROOF)) {
      const archives = await runCancellationProof(pool, actorId, transaction, fingerprints);
      if (['restoration','runtime','http'].includes(process.env.KOSTATION_REVISION_PROOF)) await runRestorationProof(pool, transaction, fingerprints, archives);
      if (process.env.KOSTATION_REVISION_PROOF === 'files') await runArchiveFilePurgeProof(pool, transaction, archives);
      if (['runtime','http'].includes(process.env.KOSTATION_REVISION_PROOF)) await require('./runtime.disposable.cjs').runBrowserRuntime(pool, target.connectionString, archives, { httpOnly: process.env.KOSTATION_REVISION_PROOF === 'http' });
      assert.deepEqual(await fingerprints(source), initialSource);
      assert.deepEqual((await source.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version')).rows, initialLedger);
      process.stdout.write('Cancellation-only proof: primary source/ledger unchanged; clone cleanup follows\n');
      return;
    }
    const evidenceId = await insertFile(pool, lease.property_id, actorId);
    const facts = {
      leaseId: lease.id,
      propertyId: lease.property_id,
      residentId: lease.resident_id,
      sourceRoomId: lease.room_id,
      targetRoomId: targetRoom.id,
      occupancyId: null,
      leaseStatus: lease.lease_status,
      commercialMode: 'rent',
      startDate: lease.start_text,
      endDate: lease.end_text,
      recordingErrorConfirmed: true,
      physicalCheckInRecorded: false,
      evidenceFileIds: [evidenceId],
      relatedTransactionCount: 0,
      ownerSponsorship: null,
      policy: { allowed: true },
      lock: true,
    };
    let available = false;
    for (const candidate of targetRooms) {
      facts.targetRoomId = candidate.id;
      try {
        await service.preview(pool, { ...facts, lock: false });
        targetRoom = candidate;
        available = true;
        break;
      } catch (error) {
        if (error.getResponse?.().code !== 'LEASE_ROOM_CORRECTION_ROOM_CONFLICT') throw error;
      }
    }
    assert.ok(
      available,
      'At least one target must pass the actual authority, not only the vacant status',
    );
    const lock = async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('booking_lead_hold:' || $1::text,0))",
        [lease.property_id],
      );
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [lease.property_id]);
      await client.query('SELECT id FROM leases WHERE id=$1 FOR UPDATE', [lease.id]);
    };
    // Failure after room writes must restore all operational bindings and money.
    await assert.rejects(
      transaction(pool, async (client) => {
        await lock(client);
        const preview = await service.preview(client, facts);
        const correctionId = await insertCorrection(client, lease, actorId);
        await client.query(
          'UPDATE files SET is_deleted=true,deleted_at=now(),deleted_by_user_id=$2 WHERE id=$1',
          [evidenceId, actorId],
        );
        await service.apply(client, facts, preview, correctionId, actorId);
      }),
      (error) =>
        error.code === '23514' && /LEASE_CORRECTION_EVIDENCE_UNAVAILABLE|LEASE_FILE_PURGE_ATTACHMENT_UNAVAILABLE/.test(error.message),
    );
    assert.deepEqual(await fingerprints(pool), baseline);
    assert.equal(
      (await pool.query('SELECT is_deleted FROM files WHERE id=$1', [evidenceId])).rows[0]
        .is_deleted,
      false,
    );

    const correctionId = await transaction(pool, async (client) => {
      await lock(client);
      const preview = await service.preview(client, facts);
      const id = await insertCorrection(client, lease, actorId);
      await service.apply(client, facts, preview, id, actorId);
      return id;
    });
    assert.equal(
      (await pool.query('SELECT room_id FROM leases WHERE id=$1', [lease.id])).rows[0].room_id,
      targetRoom.id,
    );
    const roomStates = (
      await pool.query('SELECT id,room_status FROM rooms WHERE id=ANY($1::uuid[])', [
        [lease.room_id, targetRoom.id],
      ])
    ).rows;
    assert.equal(roomStates.find((row) => row.id === lease.room_id).room_status, 'vacant');
    assert.equal(roomStates.find((row) => row.id === targetRoom.id).room_status, 'reserved');
    assert.deepEqual(
      await fingerprints(pool, [
        'payments',
        'invoices',
        'payment_receipts',
        'property_owner_realizations',
      ]),
      Object.fromEntries(
        ['payments', 'invoices', 'payment_receipts', 'property_owner_realizations'].map((table) => [
          table,
          baseline[table],
        ]),
      ),
    );
    for (const sql of [
      'UPDATE lease_data_correction_evidence SET created_at=now() WHERE file_id=$1',
      'DELETE FROM lease_data_correction_evidence WHERE file_id=$1',
    ])
      await assert.rejects(pool.query(sql, [evidenceId]), (error) => error.code === '23514');
    const repository = new FileRepository({
      client: pool,
      transaction: (callback) => transaction(pool, callback),
    });
    await assert.rejects(
      repository.softDelete(evidenceId, actorId, 'lease_revision_evidence'),
      (error) => error.getResponse?.().code === 'LEASE_CORRECTION_EVIDENCE_ATTACHED',
    );
    const context = await repository.downloadContext({
      id: evidenceId,
      propertyId: lease.property_id,
      filePurpose: 'lease_revision_evidence',
    });
    assert.ok(context.code.startsWith(`${lease.lease_code}-KOREKSI-`));
    assert.equal(context.sequence, '1');
    const otherLease = (
      await pool.query(
        'SELECT id,property_id FROM leases WHERE property_id=$1 AND id<>$2 ORDER BY id LIMIT 1',
        [lease.property_id, lease.id],
      )
    ).rows[0];
    assert.ok(otherLease, 'A second local lease is required for exclusive-file proof');
    const otherCorrection = await insertCorrection(pool, otherLease, actorId);
    await assert.rejects(
      attach(pool, otherLease, otherCorrection, evidenceId, actorId),
      (error) => error.code === '23514' && /LEASE_CORRECTION_EVIDENCE_SHARED/.test(error.message),
    );
    const sameLeaseCorrection = await insertCorrection(pool, lease, actorId);
    await attach(pool, lease, sameLeaseCorrection, evidenceId, actorId);
    for (const sql of [
      'UPDATE lease_revision_file_bindings SET lease_id=$2 WHERE file_id=$1',
      'DELETE FROM lease_revision_file_bindings WHERE file_id=$1',
    ])
      await assert.rejects(
        pool.query(sql, sql.startsWith('UPDATE') ? [evidenceId, otherLease.id] : [evidenceId]),
        (error) => error.code === '23514',
      );
    const wrongPurpose = await insertFile(pool, lease.property_id, actorId, 'payment_proof');
    await assert.rejects(
      attach(pool, lease, correctionId, wrongPurpose, actorId),
      (error) => error.code === '23514',
    );

    // Real database race: deletion waits for an in-progress attachment, then
    // re-reads it under the same row lock and rejects instead of hiding the proof.
    const secondFile = await insertFile(pool, lease.property_id, actorId);
    const attaching = await pool.connect(),
      deleting = await pool.connect();
    try {
      await attaching.query('BEGIN');
      await attach(attaching, lease, correctionId, secondFile, actorId);
      const deletePid = (await deleting.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const competing = new FileRepository({
        transaction: async (callback) => {
          await deleting.query('BEGIN');
          try {
            const result = await callback(deleting);
            await deleting.query('COMMIT');
            return result;
          } catch (error) {
            await deleting.query('ROLLBACK');
            throw error;
          }
        },
      })
        .softDelete(secondFile, actorId, 'lease_revision_evidence')
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      let blocked = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (
          (await pool.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [deletePid]))
            .rows[0].blocked
        ) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(blocked, true, 'Deletion must wait for the uncommitted attachment');
      await attaching.query('COMMIT');
      const outcome = await competing;
      assert.equal(outcome.error?.getResponse?.().code, 'LEASE_CORRECTION_EVIDENCE_ATTACHED');
      assert.equal(
        (await pool.query('SELECT is_deleted FROM files WHERE id=$1', [secondFile])).rows[0]
          .is_deleted,
        false,
      );
    } finally {
      await attaching.query('ROLLBACK');
      attaching.release();
      deleting.release();
    }
    const competingFile = await insertFile(pool, lease.property_id, actorId);
    const claiming = await pool.connect(),
      competingClaim = await pool.connect();
    try {
      await claiming.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await competingClaim.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await competingClaim.query('SELECT count(*) FROM lease_revision_file_bindings');
      await attach(claiming, lease, correctionId, competingFile, actorId);
      const pid = (await competingClaim.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const pending = attach(
        competingClaim,
        otherLease,
        otherCorrection,
        competingFile,
        actorId,
      ).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      let blocked = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if (
          (await pool.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [pid])).rows[0]
            .blocked
        ) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(blocked, true);
      await claiming.query('COMMIT');
      const outcome = await pending;
      assert.ok(
        ['23514', '40001'].includes(outcome.error?.code),
        'A stale repeatable-read snapshot must not permit a second lease to own the proof',
      );
      await competingClaim.query('ROLLBACK');
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM lease_data_correction_evidence WHERE file_id=$1',
            [competingFile],
          )
        ).rows[0].count,
        1,
      );
    } finally {
      await claiming.query('ROLLBACK');
      await competingClaim.query('ROLLBACK');
      claiming.release();
      competingClaim.release();
    }
    process.stdout.write(
      'Real PostgreSQL room reassignment, mid-command rollback, immutable/private evidence, safe filenames and attachment/delete race pass\n',
    );
    await runCombinedRoomSponsorshipProof(pool, actorId, transaction, fingerprints);
    for (const phase of ['before-check-in', 'after-check-in']) {
      await runCommercialModeCorrectionProof(pool, actorId, transaction, phase);
    }
    await runSponsorshipCorrectionProof(pool, actorId, transaction, fingerprints);
    const archives = await runCancellationProof(pool, actorId, transaction, fingerprints);
    await runRestorationProof(pool, transaction, fingerprints, archives);
    assert.deepEqual(await fingerprints(source), initialSource);
    assert.deepEqual(
      (await source.query('SELECT version,checksum_sha256 FROM schema_migrations ORDER BY version'))
        .rows,
      initialLedger,
    );
    process.stdout.write(
      'Source database and migration ledger remain unchanged; no physical file bytes touched\n',
    );
  } finally {
    await pool.end();
    if (created) {
      assert.match(database, namePattern);
      assert.notEqual(database, sourceDatabase);
      await source.query(`DROP DATABASE "${database}"`);
      process.stdout.write('Disposable clone removed\n');
    }
    await source.end();
  }
}
main().catch((error) => {
  process.stderr.write(`${error.code || error.name}: ${error.message}\n`);
  process.exitCode = 1;
});
