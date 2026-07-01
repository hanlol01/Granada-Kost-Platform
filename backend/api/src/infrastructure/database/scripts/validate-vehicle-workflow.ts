import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { CORE_SEED_IDS } from '../seeds/core-seed.data';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type VehicleResponse = {
  id: string;
  propertyId: string;
  residentId: string;
  plateNumber: string;
  vehicleType: string;
  vehicleStatus: string;
};

type ParkingZoneResponse = {
  id: string;
  propertyId: string;
  zoneCode: string;
  capacity: number;
};

type ParkingSlotResponse = {
  id: string;
  zoneId: string;
  slotNumber: string;
  slotStatus: string;
  vehicleId: string | null;
};

type VehicleSummaryResponse = {
  activeCount: number;
  motorcycleCount: number;
  carCount: number;
  pendingCount: number;
  totalRegistered: number;
};

const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  'http://localhost:',
  'http://127.0.0.1:',
);
const baseUrl = `${publicBaseUrl}/${process.env.API_PREFIX ?? 'api/v1'}`;
const runSuffix = `${Date.now()}`;
const validationNote = `Development workflow validation ${runSuffix}`;
const crossPropertyId = '88000000-0000-4000-8000-000000000001';
const crossResidentId = '88000000-0000-4000-8000-000000000002';
const crossVehicleId = '88000000-0000-4000-8000-000000000003';

async function request<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-correlation-id': `vehicle-workflow-validation-${runSuffix}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${path} expected ${expectedStatus}, got ${response.status}: ${text}`);
  }

  return data as T;
}

async function requestDenied(method: string, path: string, token: string, body?: unknown): Promise<number> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-correlation-id': `vehicle-workflow-validation-${runSuffix}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} should be denied, got ${response.status}: ${text}`);
  }

  return response.status;
}

async function validationToken(client: PoolClient, email: string): Promise<string> {
  const userResult = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  const user = userResult.rows[0];
  if (!user) {
    throw new Error(`Validation user not found: ${email}. Run db:seed:dev first.`);
  }

  const sessionId = randomUUID();
  await client.query(
    `INSERT INTO user_sessions (
       id, user_id, refresh_token_hash, device_name, expires_at
     )
     VALUES ($1, $2, 'vehicle-workflow-validation', 'vehicle-workflow-validation', now() + interval '30 minutes')`,
    [sessionId, user.id],
  );

  return signJwt(
    {
      sub: user.id,
      session_id: sessionId,
    },
    process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-at-least-32-characters',
    Math.floor(Date.now() / 1000) + 30 * 60,
  );
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresAt: number): string {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlJson({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: expiresAt,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupValidationData(client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE parking_slots
     SET vehicle_id = NULL,
         slot_status = 'available',
         updated_at = now()
     WHERE vehicle_id IN (
       SELECT id FROM vehicles WHERE notes LIKE 'Development workflow validation%'
     )`,
  );
  await client.query(
    `DELETE FROM vehicle_status_histories
     WHERE vehicle_id IN (
       SELECT id FROM vehicles WHERE notes LIKE 'Development workflow validation%'
     )`,
  );
  await client.query("DELETE FROM vehicles WHERE notes LIKE 'Development workflow validation%'");
  await client.query(
    `DELETE FROM parking_slots
     USING parking_zones
     WHERE parking_slots.zone_id = parking_zones.id
       AND parking_zones.zone_code LIKE 'VAL-%'`,
  );
  await client.query("DELETE FROM parking_zones WHERE zone_code LIKE 'VAL-%'");
  await client.query('DELETE FROM vehicle_status_histories WHERE vehicle_id = $1', [crossVehicleId]);
  await client.query('DELETE FROM vehicles WHERE id = $1', [crossVehicleId]);
  await client.query('DELETE FROM residents WHERE id = $1', [crossResidentId]);
  await client.query('DELETE FROM property_settings WHERE property_id = $1', [crossPropertyId]);
  await client.query('DELETE FROM properties WHERE id = $1', [crossPropertyId]);
}

async function setupCrossPropertyVehicle(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO properties (id, name, address, timezone, status, created_by_user_id, updated_by_user_id)
     VALUES ($1, 'Validation Cross Property', 'Development validation address', 'Asia/Jakarta', 'active', $2, $2)
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         address = EXCLUDED.address,
         status = EXCLUDED.status,
         updated_at = now()`,
    [crossPropertyId, CORE_SEED_IDS.ownerUser],
  );
  await client.query(
    `INSERT INTO property_settings (
       property_id, parking_management_mode, max_vehicles_per_resident, parking_requires_approval
     )
     VALUES ($1, 'slot', 3, true)
     ON CONFLICT (property_id) DO UPDATE
     SET parking_management_mode = EXCLUDED.parking_management_mode,
         max_vehicles_per_resident = EXCLUDED.max_vehicles_per_resident,
         parking_requires_approval = EXCLUDED.parking_requires_approval,
         updated_at = now()`,
    [crossPropertyId],
  );
  await client.query(
    `INSERT INTO residents (
       id, property_id, full_name, phone, email, ktp_number, gender, resident_status, created_by_user_id, updated_by_user_id
     )
     VALUES ($1, $2, 'Dev Cross Resident', '+6280088000001', 'dev.cross.resident@kostation.test', '8888000000000001', 'male', 'active', $3, $3)
     ON CONFLICT (id) DO UPDATE
     SET property_id = EXCLUDED.property_id,
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         ktp_number = EXCLUDED.ktp_number,
         gender = EXCLUDED.gender,
         resident_status = EXCLUDED.resident_status,
         updated_at = now()`,
    [crossResidentId, crossPropertyId, CORE_SEED_IDS.ownerUser],
  );
  await client.query(
    `INSERT INTO vehicles (
       id, property_id, resident_id, vehicle_code, plate_number, vehicle_type,
       brand, color, year, vehicle_status, notes, approved_by_user_id, approved_at,
       snapshot_resident_name, snapshot_room_number, created_by_user_id
     )
     VALUES (
       $1, $2, $3, 'VEH-CROSS-2026-0001', 'Z 8801 VAL', 'motorcycle',
       'Honda Cross', 'Black', '2024', 'active', $4, $5, now(),
       'Dev Cross Resident', NULL, $5
     )
     ON CONFLICT (property_id, vehicle_code) DO UPDATE
     SET plate_number = EXCLUDED.plate_number,
         vehicle_status = EXCLUDED.vehicle_status,
         notes = EXCLUDED.notes,
         updated_at = now()`,
    [crossVehicleId, crossPropertyId, crossResidentId, validationNote, CORE_SEED_IDS.ownerUser],
  );
}

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();

  try {
    await cleanupValidationData(client);
    await setupCrossPropertyVehicle(client);

    const adminToken = await validationToken(client, 'dev.admin@kostation.test');
    const residentAlphaToken = await validationToken(client, 'dev.resident.alpha@kostation.test');
    const residentBravoToken = await validationToken(client, 'dev.resident.bravo@kostation.test');
    const propertyOwnerToken = await validationToken(client, 'dev.property.owner@kostation.test');

    const createdVehicle = await request<VehicleResponse>('POST', '/my/vehicles', residentAlphaToken, {
      plate_number: `d   7777   val`,
      vehicle_type: 'motorcycle',
      brand: 'Honda Validation',
      color: 'Black',
      year: '2024',
      notes: validationNote,
    }, 201);
    assert(createdVehicle.plateNumber === 'D 7777 VAL', 'plate normalization did not normalize whitespace/uppercase');
    assert(createdVehicle.vehicleStatus === 'pending_approval', 'resident-created vehicle should be pending approval');

    const ownVehicles = await request<VehicleResponse[]>('GET', '/my/vehicles?limit=50&offset=0', residentAlphaToken);
    assert(ownVehicles.some((vehicle) => vehicle.id === createdVehicle.id), 'resident cannot see own vehicle');
    await request<VehicleResponse>('GET', `/my/vehicles/${createdVehicle.id}`, residentAlphaToken);
    await requestDenied('GET', `/my/vehicles/${createdVehicle.id}`, residentBravoToken);

    const approvedVehicle = await request<VehicleResponse>('POST', `/vehicles/${createdVehicle.id}/approve`, adminToken, undefined, 201);
    assert(approvedVehicle.vehicleStatus === 'active', 'vehicle approval did not set active status');

    const suspendedVehicle = await request<VehicleResponse>(
      'POST',
      `/vehicles/${createdVehicle.id}/suspend`,
      adminToken,
      { reason: 'Development validation suspension' },
      201,
    );
    assert(suspendedVehicle.vehicleStatus === 'suspended', 'vehicle suspension did not set suspended status');

    const reactivatedVehicle = await request<VehicleResponse>('POST', `/vehicles/${createdVehicle.id}/reactivate`, adminToken, undefined, 201);
    assert(reactivatedVehicle.vehicleStatus === 'active', 'vehicle reactivation did not set active status');

    const maxLimitStatus = await requestDenied('POST', '/my/vehicles', residentAlphaToken, {
      plate_number: `D 7778 VAL`,
      vehicle_type: 'motorcycle',
      brand: 'Honda Limit',
      color: 'White',
      notes: validationNote,
    });
    assert(maxLimitStatus === 400, `max vehicle limit should return 400, got ${maxLimitStatus}`);

    const zone = await request<ParkingZoneResponse>('POST', '/parking/zones', adminToken, {
      property_id: CORE_SEED_IDS.granadaProperty,
      zone_code: `VAL-${runSuffix}`,
      zone_name: `Validation Zone ${runSuffix}`,
      zone_type: 'motorcycle',
      capacity: 1,
      location_description: 'Development validation zone',
      sort_order: 99,
    }, 201);
    assert(zone.capacity === 1, 'parking zone capacity should be 1 for validation');

    const slot = await request<ParkingSlotResponse>('POST', '/parking/slots', adminToken, {
      zone_id: zone.id,
      slot_number: 'VAL-01',
      slot_type: 'motorcycle',
    }, 201);
    assert(slot.slotStatus === 'available', 'created parking slot should start available');

    const capacityStatus = await requestDenied('POST', '/parking/slots', adminToken, {
      zone_id: zone.id,
      slot_number: 'VAL-02',
      slot_type: 'motorcycle',
    });
    assert(capacityStatus === 400, `parking capacity validation should return 400, got ${capacityStatus}`);

    const assignedSlot = await request<ParkingSlotResponse>(
      'POST',
      `/parking/slots/${slot.id}/assign`,
      adminToken,
      { vehicle_id: createdVehicle.id },
      201,
    );
    assert(assignedSlot.slotStatus === 'occupied', 'slot assignment did not set occupied status');
    assert(assignedSlot.vehicleId === createdVehicle.id, 'slot assignment did not attach vehicle');

    const releasedSlot = await request<ParkingSlotResponse>('POST', `/parking/slots/${slot.id}/release`, adminToken, undefined, 201);
    assert(releasedSlot.slotStatus === 'available', 'slot release did not set available status');
    assert(releasedSlot.vehicleId === null, 'slot release did not clear vehicle');

    const crossPropertyStatus = await requestDenied('POST', `/parking/slots/${slot.id}/assign`, adminToken, {
      vehicle_id: crossVehicleId,
    });
    assert(crossPropertyStatus === 400, `cross-property parking assignment should return 400, got ${crossPropertyStatus}`);

    const summary = await request<VehicleSummaryResponse>(
      'GET',
      `/property-owner/vehicles/summary?property_id=${CORE_SEED_IDS.granadaProperty}`,
      propertyOwnerToken,
    );
    assert(summary.totalRegistered >= 9, 'property owner summary should expose aggregate vehicle counts');
    assert(summary.activeCount >= 1, 'property owner summary should include active vehicles');

    await requestDenied('GET', `/vehicles/${createdVehicle.id}`, propertyOwnerToken);

    console.log('Vehicle workflow validation passed.');
    console.log(`created_vehicle_id: ${createdVehicle.id}`);
    console.log(`validation_zone_id: ${zone.id}`);
    console.log(`validation_slot_id: ${slot.id}`);
    console.log(`property_owner_total_registered: ${summary.totalRegistered}`);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
