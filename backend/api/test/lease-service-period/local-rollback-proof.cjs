// Opt-in, local-only proof. Schema and service writes run in ONE rolled-back transaction.
require('reflect-metadata');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const {
  LeaseServicePeriodService,
} = require('../../.checkin-proof-build/modules/lease/lease-service-period.service');
const {
  LeaseActivationService,
} = require('../../.checkin-proof-build/modules/lease/lease-activation.service');
const {
  LeaseCheckInService,
} = require('../../.checkin-proof-build/modules/lease/lease-check-in.service');
const {
  LeaseDataCorrectionService,
} = require('../../.checkin-proof-build/modules/lease/lease-data-correction.service');
const {
  W06BillingService,
} = require('../../.checkin-proof-build/modules/billing/services/w06-billing.service');
const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'granada_kost',
    };
assert.equal(process.env.KOSTATION_CHECKIN_ROLLBACK_PROOF, '1', 'Explicit local opt-in required');
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(
    config.connectionString ? new URL(config.connectionString).hostname : config.host,
  ),
);
async function main() {
  const pool = new Pool(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    const migration = readFileSync(
      resolve('src/infrastructure/database/migrations/114_check_in_anchored_lease_period.sql'),
      'utf8',
    );
    await client.query(migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''));
    const {
      rows: [actor],
    } = await client.query(
      "SELECT id FROM users WHERE user_status='active' ORDER BY created_at LIMIT 1",
    );
    const { rows: leases } =
      await client.query(`SELECT lease.id,lease.property_id,lease.resident_id,lease.lease_status,lease.start_date::text,lease.end_date::text,lease.term_months,
      (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today,
      ((now() AT TIME ZONE 'Asia/Jakarta')::date+TIME '00:00') AT TIME ZONE 'Asia/Jakarta' AS checked_in_at
       FROM leases lease WHERE lease.service_period_state='pending_check_in'
         AND (lease.commercial_mode='owner_sponsored' OR EXISTS(SELECT 1 FROM lease_installments WHERE lease_id=lease.id))
       ORDER BY lease.commercial_mode DESC,lease.created_at DESC LIMIT 40`);
    assert.ok(leases.length, 'Local fixture needs pending rent leases');
    const service = new LeaseServicePeriodService(
      { client },
      { assertCanReadProperty: async () => {} },
    );
    const finance = async (id) =>
      (
        await client.query(
          `SELECT jsonb_build_object(
       'installments',(SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM lease_installments i WHERE lease_id=$1),
       'payments',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM payments p WHERE lease_id=$1),
      'invoices',(SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM invoices i WHERE lease_id=$1),
      'receipts',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM payment_receipts r JOIN payments p ON p.id=r.payment_id WHERE p.lease_id=$1),
      'allocations',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE p.lease_id=$1)) AS value`,
          [id],
        )
      ).rows[0].value;
    let tested = 0,
      pipeline = 0,
      rollbackTests = 0,
      idempotencyTests = 0,
      correctionTests = 0,
      documentQueries = 0;
    const audit = { write: async () => {} };
    const properties = { assertCanReadProperty: async () => {} };
    const checkIns = new LeaseCheckInService({ client }, properties, audit, service);
    const activations = new LeaseActivationService({ client }, properties, audit, checkIns);
    const billing = new W06BillingService({ client }, properties, audit);
    for (const lease of leases) {
      await client.query('SAVEPOINT fixture');
      try {
        const before = await finance(lease.id);
        const result = await service.finalizeLocked(client, {
          leaseId: lease.id,
          propertyId: lease.property_id,
          checkedInAt: lease.checked_in_at,
          actorId: actor.id,
          reason: 'Local rollback proof: physical check-in authority',
          commandFingerprint: randomUUID(),
        });
        assert.equal(result.startDate, lease.today);
        assert.equal(result.sequenceNumber, 1);
        assert.deepEqual(
          await finance(lease.id),
          before,
          'Financial records must remain byte-for-byte unchanged',
        );
        const {
          rows: [after],
        } = await client.query(
          'SELECT service_period_state,start_date::text,end_date::text FROM leases WHERE id=$1',
          [lease.id],
        );
        assert.equal(after.service_period_state, 'started');
        assert.equal(after.start_date, result.startDate);
        assert.equal(after.end_date, result.endDate);
        const effective = (
          await client.query(
            'SELECT coverage_start_date::text FROM lease_installment_effective_periods WHERE lease_id=$1 ORDER BY sequence_number',
            [lease.id],
          )
        ).rows;
        if (effective.length) assert.equal(effective[0].coverage_start_date, result.startDate);
        await assert.rejects(
          service.finalizeLocked(client, {
            leaseId: lease.id,
            propertyId: lease.property_id,
            checkedInAt: lease.checked_in_at,
            actorId: actor.id,
            reason: 'duplicate',
            commandFingerprint: randomUUID(),
          }),
          (error) => error.getResponse().code === 'LEASE_SERVICE_PERIOD_ALREADY_STARTED',
        );
        tested++;
      } catch (error) {
        if (
          ![
            'LEASE_SERVICE_PERIOD_ROOM_CONFLICT',
            'LEASE_SERVICE_PERIOD_REVIEW_REQUIRED',
            'LEASE_SERVICE_PERIOD_DEADLINE_REVIEW_REQUIRED',
          ].includes(error.getResponse?.().code)
        )
          throw error;
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT fixture');
      }
    }
    for (const lease of leases) {
      await client.query('SAVEPOINT lifecycle_fixture');
      try {
        if (lease.lease_status === 'awaiting_activation')
          await activations.activateLocked(client, {
            propertyId: lease.property_id,
            leaseId: lease.id,
            activatedAt: lease.checked_in_at.toISOString(),
            actorId: actor.id,
            source: 'manual_exception',
            correlationId: null,
            physicalCheckInRequested: true,
          });
        const before = await finance(lease.id);
        const beforeLease = (
          await client.query('SELECT to_jsonb(lease) AS value FROM leases lease WHERE id=$1', [
            lease.id,
          ])
        ).rows[0].value;
        let injectFailure = true;
        const commandClient = {
          query: (sql, values) => {
            if (
              injectFailure &&
              typeof sql === 'string' &&
              sql.includes('INSERT INTO occupancies(')
            )
              throw new Error('FORCED_OCCUPANCY_WRITE_FAILURE');
            return client.query(sql, values);
          },
        };
        const commandDatabase = {
          client,
          transaction: async (work) => {
            await client.query('SAVEPOINT command_transaction');
            try {
              const value = await work(commandClient);
              await client.query('RELEASE SAVEPOINT command_transaction');
              return value;
            } catch (error) {
              await client.query('ROLLBACK TO SAVEPOINT command_transaction');
              await client.query('RELEASE SAVEPOINT command_transaction');
              throw error;
            }
          },
        };
        const publicCheckIns = new LeaseCheckInService(commandDatabase, properties, audit, service);
        const dto = {
          property_id: lease.property_id,
          checked_in_at: lease.checked_in_at.toISOString(),
          notes: 'Local rollback proof: complete physical check-in',
        };
        const admin = {
          id: actor.id,
          roles: ['admin'],
          permissions: ['lease.manage', 'lease.read'],
          propertyIds: [lease.property_id],
        };
        const invoices = (
          await client.query(
            "SELECT id FROM invoices WHERE lease_id=$1 AND property_id=$2 AND invoice_status NOT IN ('draft','void') ORDER BY created_at LIMIT 1",
            [lease.id, lease.property_id],
          )
        ).rows;
        if (invoices[0]) {
          const pendingDocument = await billing.invoiceDocument(
            admin,
            lease.property_id,
            invoices[0].id,
          );
          assert.ok(pendingDocument.content.length > 0);
          documentQueries++;
        }
        const key = randomUUID();
        await assert.rejects(
          publicCheckIns.confirm({ id: actor.id }, lease.id, dto, key, {}),
          /FORCED_OCCUPANCY_WRITE_FAILURE/,
        );
        assert.deepEqual(
          (
            await client.query('SELECT to_jsonb(lease) AS value FROM leases lease WHERE id=$1', [
              lease.id,
            ])
          ).rows[0].value,
          beforeLease,
        );
        assert.deepEqual(await finance(lease.id), before);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM lease_service_period_versions WHERE lease_id=$1',
              [lease.id],
            )
          ).rows[0].count,
          0,
        );
        rollbackTests++;
        injectFailure = false;
        const { data: result } = await publicCheckIns.confirm(
          { id: actor.id },
          lease.id,
          dto,
          key,
          {},
        );
        const replay = await publicCheckIns.confirm({ id: actor.id }, lease.id, dto, key, {});
        assert.deepEqual(replay.data, result);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM lease_service_period_versions WHERE lease_id=$1',
              [lease.id],
            )
          ).rows[0].count,
          1,
        );
        idempotencyTests++;
        assert.equal(result.servicePeriod.startDate, lease.today);
        const occupied = (
          await client.query('SELECT start_date::text FROM occupancies WHERE id=$1', [
            result.occupancyId,
          ])
        ).rows[0];
        assert.equal(occupied.start_date, lease.today);
        assert.deepEqual(await finance(lease.id), before);
        await billing.residentDetail(admin, lease.property_id, lease.resident_id);
        await billing.currentWorklist(admin, { property_id: lease.property_id, limit: 2 });
        await billing.paymentWorkspace(admin, { property_id: lease.property_id, limit: 2 });
        if (invoices[0]) {
          const currentDocument = await billing.invoiceDocument(
            admin,
            lease.property_id,
            invoices[0].id,
          );
          const originalDocument = await billing.originalInvoiceDocument(
            admin,
            lease.property_id,
            invoices[0].id,
          );
          assert.ok(currentDocument.content.length > 0 && originalDocument.content.length > 0);
          documentQueries += 2;
          const authority = (await client.query(`${billing.invoiceDocumentSql()} WHERE invoice.id=$1 AND invoice.property_id=$2`, [invoices[0].id, lease.property_id])).rows[0];
          assert.equal(authority.contract_start, lease.today);
          assert.equal(authority.service_period_pending, false);
        }
        const repository = {
          query: (sql, values) => client.query(sql, values),
          transaction: commandDatabase.transaction,
        };
        const corrections = new LeaseDataCorrectionService(repository, billing, service);
        const date = new Date(`${lease.today}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() - 1);
        const amendedDate = date.toISOString().slice(0, 10);
        const amendment = {
          start_date: amendedDate,
          checked_in_date: amendedDate,
          reason: 'Local rollback proof: reviewed actual arrival date',
        };
        const preview = await corrections.preview(admin, lease.id, amendment);
        assert.equal(preview.data.impact.contract_amount_delta, 0);
        const corrected = await corrections.commit(admin, lease.id, amendment, randomUUID());
        assert.equal(corrected.data.correction.corrected.start_date, amendedDate);
        assert.equal(corrected.data.correction.corrected.term_months, Number(lease.term_months));
        assert.deepEqual(
          await finance(lease.id),
          before,
          'Date-only amendment must preserve immutable financial facts',
        );
        const periodHistory = await service.history(admin, lease.id, lease.property_id);
        assert.equal(periodHistory.data.length, 2);
        assert.equal(periodHistory.data[0].source, 'lease_data_correction');
        correctionTests++;
        pipeline++;
      } catch (error) {
        const code = error.getResponse?.().code;
        if (
          ![
            'LEASE_SERVICE_PERIOD_ROOM_CONFLICT',
            'LEASE_SERVICE_PERIOD_REVIEW_REQUIRED',
            'LEASE_SERVICE_PERIOD_DEADLINE_REVIEW_REQUIRED',
            'LEASE_SERVICE_PERIOD_LEGACY_REVIEW_REQUIRED',
            'LEASE_ACTIVATION_INITIAL_PAYMENT_REQUIRED',
            'LEASE_ACTIVATION_SETTLEMENT_NOT_READY',
            'LEASE_ACTIVATION_PAYMENT_REQUIRED',
            'LEASE_CHECK_IN_CONFLICT',
          ].includes(code)
        )
          throw error;
        // Existing fixture business gates (payment minimum, hold or room conflicts) remain enforced.
        console.log(JSON.stringify({ skippedLifecycleFixture: code }));
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT lifecycle_fixture');
      }
      if (pipeline >= 3) break;
    }
    assert.ok(tested > 0, 'At least one conflict-free check-in must be proven');
    assert.ok(pipeline > 0, 'At least one complete activation/check-in must be proven');
    console.log(
      JSON.stringify({
        schema: 'valid',
        checkInFixtures: tested,
        lifecycleFixtures: pipeline,
        rollbackTests,
        idempotencyTests,
        correctionTests,
        documentQueries,
        financialRecords: 'unchanged',
        writes: 'rolled_back',
      }),
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
