// Prepare legitimate no-money fixtures through the real onboarding authorities,
// never by rewriting a lease/payment/check-in copied from the source database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { OnboardingService } = require('../../src/modules/resident/onboarding.service.ts');
const { ResidentAccountService } = require('../../src/modules/resident/resident-account.service.ts');
const { AuditRepository } = require('../../src/infrastructure/audit/audit.repository.ts');
const { ContractScheduleIssuanceService } = require('../../src/modules/billing/services/contract-schedule-issuance.service.ts');

async function prepareSponsoredLeaseFixture(pool, actorId, repository, filters = {}) {
  assert.match((await pool.query('SELECT current_database() AS name')).rows[0].name,
    /^kostation_h08_revision_[a-f0-9]{12}_m1_qa$/);
  const room = (await pool.query(`SELECT room.id,room.property_id,building.gender_policy,assignment.owner_profile_id
    FROM rooms room JOIN room_buildings building ON building.id=room.building_id
    JOIN building_owner_assignments assignment ON assignment.building_id=room.building_id AND assignment.property_id=room.property_id
    JOIN kost_types type ON type.id=room.kost_type_id
    WHERE room.room_status='vacant' AND room.category='rukost' AND assignment.assignment_status='active'
      AND type.status='active' AND type.deleted_at IS NULL AND building.gender_policy IN ('male','female')
      AND ($1::uuid IS NULL OR room.property_id=$1) AND ($2::text IS NULL OR building.gender_policy=$2)
       AND ($3::uuid IS NULL OR room.id<>$3)
       AND ($4::uuid IS NULL OR room.id=$4)
      AND NOT EXISTS(SELECT 1 FROM leases lease WHERE lease.room_id=room.id AND lease.lease_status IN ('draft','awaiting_activation','active'))
      AND NOT EXISTS(SELECT 1 FROM booking_lead_holds hold WHERE hold.room_id=room.id AND hold.hold_status IN ('active','committed'))
    ORDER BY room.number LIMIT 1`, [filters.propertyId ?? null, filters.gender ?? null, filters.excludeRoomId ?? null, filters.roomId ?? null])).rows[0];
  assert.ok(room, 'A genuinely available owned room is required for clone-only onboarding');
  const user = { id: actorId, roles: ['admin'], permissions: ['lease.manage','lease.read'], propertyIds: [room.property_id] };
  const properties = { assertCanReadProperty: async (actor, propertyId) => assert.ok(actor.propertyIds.includes(propertyId)) };
  const audit = new AuditRepository(repository);
  const onboarding = new OnboardingService(repository, properties,
    new ResidentAccountService(repository, {}, properties, audit), audit, {}, new ContractScheduleIssuanceService());
  const date = (await pool.query("SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS date")).rows[0].date;
  const token = randomUUID().replaceAll('-', '');
  const email = `h08-cancel-${token}@example.invalid`;
  const dto = { property_id: room.property_id, room_id: room.id,
    visitor_name: 'H08 disposable cancellation fixture',
    visitor_phone: `0899${parseInt(token.slice(0,8),16).toString().padStart(10,'0')}`,
    visitor_email: email, gender: room.gender_policy,
    start_date: date, term_months: 12, commercial_mode: 'owner_sponsored',
    sponsoring_owner_profile_id: room.owner_profile_id, management_fee_mode: 'waived',
    owner_sponsorship_reason: 'Disposable proof: original Owner instruction', billing_cycle: 'yearly',
    payment_plan_type: 'annual_full', accepted_terms_version: 'h08-disposable-proof',
    dp_verified_amount: 0, security_deposit_funded_amount: 0, payment_method: 'cash',
  };
  return { dto, onboarding, user, room };
}
module.exports.prepareSponsoredLeaseFixture = prepareSponsoredLeaseFixture;
module.exports.createSponsoredLeaseFixture = async function(pool, actorId, repository) {
  const { dto, onboarding, user, room } = await prepareSponsoredLeaseFixture(pool, actorId, repository);
  await onboarding.commit(user, dto, randomUUID(), {});
  const lease = (await pool.query(`SELECT lease.id,lease.property_id,lease.room_id,lease.resident_id,lease.commercial_mode,lease.lease_status
    FROM leases lease JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
    WHERE resident.email=$1 AND lease.room_id=$2`, [dto.visitor_email, room.id])).rows[0];
  assert.ok(lease, 'Canonical onboarding must create its own lease');
  return { lease, user };
};
