// Real room-status authority, exclusively inside the guarded clone. Never clear occupancy or money.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { RoomService } = require('../../src/modules/room/room.service.ts');
const { RoomRepository } = require('../../src/modules/room/repositories/room.repository.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');

module.exports.ensureCompatibleOwnedVacancies = async function(pool, actorId, repository) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const candidates = (await pool.query(`WITH owned AS (
    SELECT room.id,room.property_id,room.room_status,building.gender_policy,
      COALESCE(house.owner_profile_id,apartment.owner_profile_id) AS owner_profile_id
    FROM rooms room JOIN room_buildings building ON building.id=room.building_id
      JOIN kost_types type ON type.id=room.kost_type_id
      LEFT JOIN building_owner_assignments house ON room.category='rukost' AND house.building_id=room.building_id
        AND house.property_id=room.property_id AND house.assignment_status='active'
      LEFT JOIN room_owner_assignments apartment ON room.category='apartkost' AND apartment.room_id=room.id
        AND apartment.property_id=room.property_id AND apartment.assignment_status='active'
    WHERE room.room_status IN ('vacant','maintenance','inspection_required')
      AND type.status='active' AND type.deleted_at IS NULL AND building.gender_policy IN ('male','female')
      AND NOT EXISTS(SELECT 1 FROM leases lease WHERE lease.room_id=room.id AND lease.lease_status IN ('draft','awaiting_activation','active'))
      AND NOT EXISTS(SELECT 1 FROM occupancies occupancy WHERE occupancy.room_id=room.id AND occupancy.occupancy_status='active')
      AND NOT EXISTS(SELECT 1 FROM onboarding_commitments commitment WHERE commitment.room_id=room.id
        AND commitment.status IN ('draft','awaiting_documents','awaiting_financials','ready_to_commit','committed'))
      AND NOT EXISTS(SELECT 1 FROM booking_lead_holds hold WHERE hold.room_id=room.id
        AND (hold.hold_status='committed' OR hold.hold_status='active' AND hold.expires_at>now()))
      AND NOT EXISTS(SELECT 1 FROM lease_transfer_commands transfer WHERE transfer.to_room_id=room.id AND transfer.state='scheduled')
  ) SELECT source.id AS source_id,target.id AS target_id,source.property_id,
    source.room_status AS source_status,target.room_status AS target_status
    FROM owned source JOIN owned target ON target.property_id=source.property_id AND target.gender_policy=source.gender_policy
      AND target.owner_profile_id<>source.owner_profile_id
    WHERE source.owner_profile_id IS NOT NULL AND target.owner_profile_id IS NOT NULL
    ORDER BY (source.room_status='vacant') DESC,(target.room_status='vacant') DESC,source.id,target.id LIMIT 1`)).rows[0];
  assert.ok(candidates, 'Two genuinely unclaimed owned rooms with compatible gender are required; no source facts are rewritten');
  const properties = { assertCanReadProperty: async (user, propertyId) => assert.ok(user.propertyIds.includes(propertyId)) };
  const service = new RoomService(new RoomRepository(repository), properties, new AuditRepository(repository), repository);
  const user = { id: actorId, roles: ['admin'], permissions: ['room.manage'], propertyIds: [candidates.property_id] };
  for (const [id, status] of [[candidates.source_id, candidates.source_status], [candidates.target_id, candidates.target_status]]) {
    if (status === 'inspection_required') await service.resolveRoomInspection(user, id,
      { outcome: 'pass', notes: 'Disposable clone fixture only; not a live physical inspection' }, randomUUID(), {});
    else if (status === 'maintenance') await service.updateRoomStatus(user, id, { status: 'vacant' }, {});
    assert.equal((await pool.query('SELECT room_status FROM rooms WHERE id=$1', [id])).rows[0].room_status, 'vacant');
  }
  process.stdout.write('Compatible Owner room fixture prepared through room-status authorities in disposable clone only\n');
};
