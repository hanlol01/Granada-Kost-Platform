const assert = require('node:assert/strict');
const test = require('node:test');
const { LeaseDataCorrectionService } = require('../../dist/modules/lease/lease-data-correction.service.js');
const { ResidentRepository, residentCorrectionHistoryFilterSql } = require('../../dist/modules/resident/repositories/resident.repository.js');

const propertyId = '00000000-0000-4000-8000-000000000001';
const residentId = '00000000-0000-4000-8000-000000000002';
const actor = { roles: ['admin'], permissions: ['lease.read'], propertyIds: [propertyId] };
const before = { startDate: '2026-08-01', endDate: '2026-11-01', termMonths: 3, agreedMonthlyPrice: 1900000, contractRentAmount: 5700000, checkedInDate: '2026-08-01' };
const row = { id: 'correction', property_id: propertyId, lease_id: 'ended-contract', sequence_number: 2, correction_kind: 'contract_term', previous_snapshot: before, corrected_snapshot: { ...before, termMonths: 2, contractRentAmount: 3800000 }, contract_amount_delta: '-1900000', additional_charge_amount: '0', contract_credit_amount: '1900000', verified_rent_payment_amount: '5700000', outstanding_amount_after: '0', overpayment_amount_after: '1900000', reason: 'Durasi salah input', created_by_user_id: 'admin', created_by_name: 'Admin pencatat', room_number: 'RK-06-03', created_at: new Date('2026-10-02T03:00:00Z') };

test('history is Admin scoped and needs read permission, without requiring mutation authority', async () => {
  let calls = 0;
  const service = new LeaseDataCorrectionService({ query: async () => { calls++; return { rows: [] }; } }, {});
  for (const user of [{ ...actor, roles: ['property_owner'] }, { ...actor, permissions: [] }, { ...actor, propertyIds: [] }]) {
    await assert.rejects(service.listForResident(user, residentId, propertyId), (error) => error.getResponse().code === 'LEASE_CORRECTION_HISTORY_FORBIDDEN');
  }
  assert.equal(calls, 0);
});

test('reads historical contracts, preserves recorded before/after/amounts and includes actor/room', async () => {
  const queries = [];
  const service = new LeaseDataCorrectionService({ query: async (sql, values) => { queries.push({ sql, values }); return { rows: sql.startsWith('SELECT id FROM residents') ? [{ id: residentId }] : [row] }; } }, {});
  const response = await service.listForResident(actor, residentId, propertyId);
  const record = response.data.corrections[0];
  assert.equal(record.lease_id, 'ended-contract');
  assert.equal(record.previous.contract_rent_amount, 5700000);
  assert.equal(record.corrected.contract_rent_amount, 3800000);
  assert.equal(record.impact.contract_credit_amount, 1900000);
  assert.equal(record.created_by_name, 'Admin pencatat');
  assert.equal(record.room_number, 'RK-06-03');
  assert.deepEqual(queries[1].values, [residentId, propertyId]);
  assert.doesNotMatch(queries[1].sql, /lease_status\s*=/);
});

test('resident list/count bind the same correction-history filter and retain pagination positions', async () => {
  const queries = [];
  const repository = new ResidentRepository({ client: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: sql.startsWith('SELECT count') ? [{ total: '0' }] : [] }; } } });
  for (const correction_history of ['ever', 'never', undefined]) {
    await repository.list({ property_id: propertyId, correction_history, limit: 20, offset: 40 }, [propertyId]);
    await repository.count({ property_id: propertyId, correction_history }, [propertyId]);
    const [list, count] = queries.splice(0);
    assert.equal(list.values[18], 20);
    assert.equal(list.values[19], 40);
    assert.equal(list.values[20], correction_history ?? null);
    assert.equal(count.values[18], correction_history ?? null);
    assert.match(list.sql, /corrected_lease.resident_id = residents.id/);
    assert.match(count.sql, /corrected_lease.resident_id = residents.id/);
  }
});

test('PostgreSQL correction filter covers ended contracts, deduplicates residents and isolates property', async () => {
  const { config } = require('dotenv');
  const { Pool } = require('pg');
  const { explicitDatabaseConfigFromEnv } = require('../../dist/infrastructure/database/scripts/database-url.js');
  config({ path: '.env', quiet: true });
  config({ path: '.env.local', override: true, quiet: true });
  const database = explicitDatabaseConfigFromEnv();
  const host = database.connectionString ? new URL(database.connectionString).hostname : database.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Local database required');
  const pool = new Pool(database);
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const fixture = `WITH residents(id,property_id) AS (VALUES ('ended-only','a'),('multiple','a'),('never','a'),('other','b')),
      leases(id,resident_id,property_id,lease_status) AS (VALUES ('l1','ended-only','a','terminated'),('l2','multiple','a','active'),('l3','multiple','a','terminated'),('l4','other','b','active')),
      lease_data_corrections(lease_id,property_id) AS (VALUES ('l1','a'),('l2','a'),('l2','a'),('l3','a'),('l4','b'))
      SELECT residents.id FROM residents WHERE residents.property_id = $2
      AND ${residentCorrectionHistoryFilterSql('$1')}
      ORDER BY residents.id LIMIT $3 OFFSET $4`;
    const run = async (filter, limit = 20, offset = 0, scope = 'a') => (await client.query(fixture, [filter, scope, limit, offset])).rows.map((entry) => entry.id);
    assert.deepEqual(await run(null), ['ended-only', 'multiple', 'never']);
    // Lexicographic order is stable; an ended contract still counts as corrected.
    assert.deepEqual(await run('ever'), ['ended-only', 'multiple']);
    assert.deepEqual(await run('never'), ['never']);
    assert.deepEqual(await run('ever', 1, 1), ['multiple']);
    assert.deepEqual(await run('ever', 20, 0, 'b'), ['other']);

    const properties = await client.query('SELECT DISTINCT property_id FROM residents ORDER BY property_id LIMIT 1');
    if (properties.rows.length) {
      const scope = properties.rows[0].property_id;
      const repository = new ResidentRepository({ client });
      const total = await repository.count({ property_id: scope }, [scope]);
      const corrected = await repository.count({ property_id: scope, correction_history: 'ever' }, [scope]);
      const never = await repository.count({ property_id: scope, correction_history: 'never' }, [scope]);
      assert.equal(corrected + never, total);
      for (const filter of [undefined, 'ever', 'never']) {
        const page = await repository.list({ property_id: scope, correction_history: filter, limit: 20, offset: 0 }, [scope]);
        assert.ok(page.length <= 20);
        assert.equal(new Set(page.map((resident) => resident.id)).size, page.length);
        for (const resident of page) {
          assert.equal(resident.propertyId, scope);
          if (filter === 'ever') assert.ok(resident.leaseCorrectionCount > 0);
          if (filter === 'never') assert.equal(resident.leaseCorrectionCount, 0);
        }
      }
      const residents = await client.query('SELECT id FROM residents WHERE property_id = $1 ORDER BY id LIMIT 1', [scope]);
      const service = new LeaseDataCorrectionService({ query: (sql, values) => client.query(sql, values) }, {});
      const history = await service.listForResident({ ...actor, propertyIds: [scope] }, residents.rows[0].id, scope);
      for (const entry of history.data.corrections) assert.equal(entry.property_id, scope);
    }
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
