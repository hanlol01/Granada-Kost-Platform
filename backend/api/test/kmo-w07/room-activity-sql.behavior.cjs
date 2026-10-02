// PostgreSQL executes the real projection against read-only CTE fixtures.
const assert = require('node:assert/strict');
const { config } = require('dotenv');
const { Pool } = require('pg');
const { explicitDatabaseConfigFromEnv } = require('../../dist/infrastructure/database/scripts/database-url.js');
const { ROOM_ACTIVITY_SQL } = require('../../dist/modules/admin-ux-master/room-activity.sql.js');
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const fixture = `WITH
 rooms(id,property_id,number) AS (VALUES ('${id(2)}'::uuid,'${id(1)}'::uuid,'RK-06-03'),('${id(3)}'::uuid,'${id(1)}'::uuid,'RK-06-06'),('${id(4)}'::uuid,'${id(1)}'::uuid,'RK-06-07')),
 residents(id,property_id,full_name) AS (VALUES ('${id(5)}'::uuid,'${id(1)}'::uuid,'Penghuni uji')),
 room_transfer_records(id,property_id,resident_id,from_lease_id,from_room_id,to_room_id,created_at) AS
 (VALUES ('${id(6)}'::uuid,'${id(1)}'::uuid,'${id(5)}'::uuid,'${id(7)}'::uuid,'${id(2)}'::uuid,'${id(3)}'::uuid,'2026-10-01T01:00:00Z'::timestamptz)),
 leases(id,property_id,resident_id,room_id) AS (VALUES ('${id(7)}'::uuid,'${id(1)}'::uuid,'${id(5)}'::uuid,'${id(3)}'::uuid)),
 lease_history(lease_id,property_id,event_type,created_at) AS
 (VALUES ('${id(7)}'::uuid,'${id(1)}'::uuid,'transferred_out','2026-10-01T01:00:00Z'::timestamptz),('${id(7)}'::uuid,'${id(1)}'::uuid,'transferred_in','2026-10-01T01:00:00Z'::timestamptz),('${id(7)}'::uuid,'${id(1)}'::uuid,'lease_data_corrected','2026-09-29T01:00:00Z'::timestamptz)),
 audit_logs(property_id,resource_type,resource_id,action,occurred_at) AS
 (SELECT NULL::uuid,NULL::text,NULL::uuid,NULL::text,NULL::timestamptz WHERE false),
 occupancies(id,property_id,resident_id,room_id) AS (VALUES ('${id(8)}'::uuid,'${id(1)}'::uuid,'${id(5)}'::uuid,'${id(3)}'::uuid)),
 occupancy_history(occupancy_id,event_type,created_at) AS (VALUES ('${id(8)}'::uuid,'check_out','2026-10-02T01:00:00Z'::timestamptz)),
 lease_checkout_commands(id,property_id,resident_id,room_id,state,completed_at) AS
 (VALUES ('${id(9)}'::uuid,'${id(1)}'::uuid,'${id(5)}'::uuid,'${id(3)}'::uuid,$3::text,'2026-10-03T01:00:00Z'::timestamptz)),
 lease_exit_final_settlements(id,checkout_command_id,property_id,decision_status) AS
 (VALUES ('${id(10)}'::uuid,'${id(9)}'::uuid,'${id(1)}'::uuid,$4::text)),
 lease_exit_refunds(id,property_id,final_settlement_id,refund_status,settled_at) AS
 (SELECT '${id(11)}'::uuid,'${id(1)}'::uuid,'${id(10)}'::uuid,$5::text,'2026-10-04T01:00:00Z'::timestamptz WHERE $5::text IS NOT NULL),
 lease_exit_final_invoice_links(final_settlement_id,property_id,invoice_id,linked_amount) AS
 (SELECT '${id(10)}'::uuid,'${id(1)}'::uuid,'${id(12)}'::uuid,100::bigint WHERE $4::text='amount_due'),
 invoices(id,property_id,total_amount,credit_amount) AS (VALUES ('${id(12)}'::uuid,'${id(1)}'::uuid,100::bigint,0::bigint)),
 payments(id,property_id,payment_status,verified_at,paid_at) AS
 (VALUES ('${id(13)}'::uuid,'${id(1)}'::uuid,'verified','2026-10-05T01:00:00Z'::timestamptz,'2026-10-05T01:00:00Z'::timestamptz)),
 payment_allocations(id,invoice_id,payment_id,allocated_amount) AS (VALUES ('${id(14)}'::uuid,'${id(12)}'::uuid,'${id(13)}'::uuid,$6::bigint)),
 payment_reversal_allocations(original_allocation_id,reversed_amount) AS (VALUES ('${id(14)}'::uuid,$7::bigint)),
 business_events(property_id,aggregate_type,aggregate_id,event_type,payload,created_at) AS
 (VALUES ('${id(1)}'::uuid,'room','${id(2)}'::uuid,'room.inspection_resolved','{"next_status":"maintenance","notes":"Pintu rusak"}'::jsonb,'2026-10-02T02:00:00Z'::timestamptz)),
 booking_lead_holds(property_id,room_id,created_at,released_at,expires_at,hold_status) AS
 (SELECT NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::text WHERE false),
 maintenance_work_orders(id,property_id,room_id) AS (SELECT NULL::uuid,NULL::uuid,NULL::uuid WHERE false),
 maintenance_work_order_histories(work_order_id,to_status,changed_at) AS (SELECT NULL::uuid,NULL::text,NULL::timestamptz WHERE false)
 ${ROOM_ACTIVITY_SQL}`;

async function main() {
  config({ path: '.env', quiet: true });
  config({ path: '.env.local', override: true, quiet: true });
  const database = explicitDatabaseConfigFromEnv();
  const host = database.connectionString ? new URL(database.connectionString).hostname : database.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Local database required');
  const pool = new Pool(database);
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const activity = (room, state='completed', decision='closed', refund=null, paid=0, reversed=0) =>
      client.query(fixture, [id(1), id(room), state, decision, refund, paid, reversed]);
    const origin = (await activity(2)).rows;
    assert.equal(origin.filter((event) => /transfer/.test(event.event_type)).length, 1);
    assert.equal(origin.find((event) => event.event_type === 'room_transfer_out').other_room_number, 'RK-06-06');
    assert.equal(origin.find((event) => event.event_type === 'room_inspection_failed').notes, 'Pintu rusak');
    const correction = origin.filter((event) => event.event_type === 'lease_lease_data_corrected');
    assert.equal(correction.length, 1);
    assert.equal(correction[0].resident_id, id(5));
    const destination = (await activity(3)).rows;
    assert.equal(destination.filter((event) => /transfer/.test(event.event_type)).length, 1);
    assert.equal(destination.find((event) => event.event_type === 'room_transfer_in').other_room_number, 'RK-06-03');
    assert.ok(!destination.some((event) => event.event_type === 'lease_lease_data_corrected'));
    assert.equal((await activity(4)).rows.length, 0);
    const scenarios = [
      ['scheduled','closed',null,0,0,false], ['completed','refund_pending','pending',0,0,false],
      ['completed','refund_pending','reversed',0,0,false], ['completed','refund_pending','settled',0,0,true],
      ['completed','refund_pending','waived',0,0,true], ['completed','amount_due',null,80,0,false],
      ['completed','amount_due',null,100,0,true], ['completed','amount_due',null,100,30,false],
      ['completed','closed',null,0,0,true],
    ];
    for (const [state,decision,refund,paid,reversed,closed] of scenarios) {
      const result = (await activity(3,state,decision,refund,paid,reversed)).rows;
      assert.ok(result.some((event) => event.event_type === 'occupancy_check_out'));
      const completed = result.find((event) => event.event_type === 'checkout_financial_completed');
      assert.equal(Boolean(completed), closed, `${decision}/${refund}/${paid}/${reversed}`);
      if (decision === 'amount_due' && closed) assert.equal(completed.occurred_at.toISOString(),'2026-10-05T01:00:00.000Z');
      if (refund === 'settled') assert.equal(completed.occurred_at.toISOString(),'2026-10-04T01:00:00.000Z');
    }
    await client.query('ROLLBACK');
    console.log('12 PostgreSQL activity scenarios passed: room scope, no duplicate moves, physical vs financial checkout, refunds, payments and reversals. No records changed.');
  } finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode=1; });
