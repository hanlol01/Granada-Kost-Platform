// Read-only verification against an explicitly configured local database.
const assert = require('node:assert/strict');
const { config } = require('dotenv');
const { Pool } = require('pg');
const { explicitDatabaseConfigFromEnv } = require('../../dist/infrastructure/database/scripts/database-url.js');
const { ROOM_ACTIVITY_SQL } = require('../../dist/modules/admin-ux-master/room-activity.sql.js');

async function main() {
  config({ path: '.env', quiet: true });
  config({ path: '.env.local', override: true, quiet: true });
  const database = explicitDatabaseConfigFromEnv();
  const host = database.connectionString ? new URL(database.connectionString).hostname : database.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Only a local database may be verified');
  const pool = new Pool(database);
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const rooms = await client.query(`SELECT id, property_id, number FROM rooms
      WHERE number = ANY($1::text[]) ORDER BY number`, [['RK-06-03', 'RK-06-06', 'RK-06-07']]);
    assert.equal(rooms.rows.length, 3);
    for (const room of rooms.rows) {
      const timeline = await client.query(ROOM_ACTIVITY_SQL, [room.property_id, room.id]);
      const expected = await client.query(`SELECT record.created_at, resident.full_name,
        CASE WHEN record.from_room_id=$2 THEN 'room_transfer_out' ELSE 'room_transfer_in' END AS event_type,
        CASE WHEN record.from_room_id=$2 THEN destination.number ELSE origin.number END AS other_room_number
        FROM room_transfer_records record
        JOIN residents resident ON resident.id=record.resident_id AND resident.property_id=record.property_id
        JOIN rooms origin ON origin.id=record.from_room_id AND origin.property_id=record.property_id
        JOIN rooms destination ON destination.id=record.to_room_id AND destination.property_id=record.property_id
        WHERE record.property_id=$1 AND (record.from_room_id=$2 OR record.to_room_id=$2)`, [room.property_id, room.id]);
      const movements = timeline.rows.filter((event) => event.event_type.startsWith('room_transfer_'));
      for (const movement of movements) {
        assert.ok(expected.rows.some((event) => event.event_type === movement.event_type
          && event.other_room_number === movement.other_room_number
          && event.full_name === movement.resident_name
          && event.created_at.getTime() === movement.occurred_at.getTime()));
      }
      const sample = movements.find((event) => event.resident_name.toLowerCase() === 'negosiasi');
      if (room.number === 'RK-06-03') assert.equal(sample?.other_room_number, 'RK-06-06');
      if (room.number === 'RK-06-06') assert.equal(sample?.other_room_number, 'RK-06-03');
      if (room.number === 'RK-06-07') assert.equal(sample, undefined);
      console.log(JSON.stringify({ room: room.number, movementCount: movements.length,
        movements: movements.map((event) => ({ direction: event.event_type, otherRoom: event.other_room_number })) }));
    }
    const checkouts = await client.query(`SELECT DISTINCT room_id, property_id FROM lease_checkout_commands WHERE state='completed' LIMIT 20`);
    for (const room of checkouts.rows) {
      await client.query(ROOM_ACTIVITY_SQL, [room.property_id, room.room_id]);
    }
    console.log(`SQL activity verified for ${rooms.rows.length} move rooms and ${checkouts.rows.length} checkout rooms; no records changed.`);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
