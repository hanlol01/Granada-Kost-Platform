import argon2 from 'argon2';
import { Pool, PoolClient } from 'pg';
import {
  CORE_SEED_IDS,
  DEV_OCCUPANCY_SEEDS,
  DEV_RESIDENT_SEEDS,
  GRANADA_PROPERTY,
  PERMISSIONS,
  ROLE_PERMISSION_GRANTS,
  ROLES,
  ROOM_FACILITIES,
  ROOM_SEEDS,
  ROOM_TYPES,
  SeedEnvironment,
  ownerIdentityFor,
} from '../seeds/core-seed.data';
import { databaseConfigFromEnv } from './database-url';

type SeedCount = {
  table: string;
  count: number;
};

type ValidationCheck = {
  check: string;
  count: number;
};

function resolveSeedEnvironment(): SeedEnvironment {
  const envArg = process.argv.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const value = envArg ?? process.env.SEED_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  if (value !== 'development' && value !== 'production') {
    throw new Error(`Unsupported seed environment "${value}". Use development or production.`);
  }

  return value;
}

function ownerPasswordFor(environment: SeedEnvironment): string {
  const configured = process.env.SEED_OWNER_PASSWORD;
  if (configured) {
    return configured;
  }

  if (environment === 'production') {
    throw new Error('SEED_OWNER_PASSWORD is required for production seed.');
  }

  return 'Granada@Dev2026!';
}

function shouldSeedDevelopmentData(environment: SeedEnvironment): boolean {
  const requested = process.argv.includes('--with-dev-data') || process.env.SEED_WITH_DEV_DATA === 'true';
  if (!requested) {
    return false;
  }
  if (environment !== 'development') {
    throw new Error('Development seed data can only run with --env=development.');
  }
  return true;
}

async function seedLayer0(client: PoolClient, environment: SeedEnvironment): Promise<void> {
  for (const [code, name, description] of ROLES) {
    await client.query(
      `INSERT INTO roles (code, name, description, is_system_role)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           is_system_role = EXCLUDED.is_system_role`,
      [code, name, description],
    );
  }

  for (const [code, name, description] of PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (code, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description`,
      [code, name, description],
    );
  }

  for (const [roleCode, permissionCode] of ROLE_PERMISSION_GRANTS) {
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT roles.id, permissions.id
       FROM roles
       JOIN permissions ON permissions.code = $2
       WHERE roles.code = $1
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleCode, permissionCode],
    );
  }

  const owner = ownerIdentityFor(environment);
  const passwordHash = await argon2.hash(ownerPasswordFor(environment));
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, user_status, password_changed_at)
     VALUES ($1, $2, $3, $4, 'active', now())
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         user_status = EXCLUDED.user_status,
         password_changed_at = EXCLUDED.password_changed_at,
         updated_at = now()`,
    [CORE_SEED_IDS.ownerUser, owner.email, passwordHash, owner.displayName],
  );

  await client.query(
    `INSERT INTO user_property_roles (user_id, property_id, role_id, assigned_by_user_id)
     SELECT $1::uuid, NULL, roles.id, $1::uuid
     FROM roles
     WHERE roles.code = 'owner'
     ON CONFLICT ON CONSTRAINT user_property_roles_unique_active DO NOTHING`,
    [CORE_SEED_IDS.ownerUser],
  );
}

async function seedLayer1(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO properties (
       id, name, address, timezone, status, created_by_user_id, updated_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         address = EXCLUDED.address,
         timezone = EXCLUDED.timezone,
         status = EXCLUDED.status,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now()`,
    [
      GRANADA_PROPERTY.id,
      GRANADA_PROPERTY.name,
      GRANADA_PROPERTY.address,
      GRANADA_PROPERTY.timezone,
      GRANADA_PROPERTY.status,
      CORE_SEED_IDS.ownerUser,
    ],
  );
}

async function seedLayer2(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO property_settings (
       property_id, default_due_day, late_fee_percent_per_day, booking_fee_amount,
       quiet_hour_start, guest_report_deadline
     )
     VALUES ($1, 25, 1.00, 100000, '21:00:00', '21:00:00')
     ON CONFLICT (property_id) DO UPDATE
     SET default_due_day = EXCLUDED.default_due_day,
         late_fee_percent_per_day = EXCLUDED.late_fee_percent_per_day,
         booking_fee_amount = EXCLUDED.booking_fee_amount,
         quiet_hour_start = EXCLUDED.quiet_hour_start,
         guest_report_deadline = EXCLUDED.guest_report_deadline,
         updated_at = now()`,
    [CORE_SEED_IDS.granadaProperty],
  );
}

async function seedLayer3(client: PoolClient): Promise<void> {
  for (const roomType of ROOM_TYPES) {
    await client.query(
      `INSERT INTO room_types (
         id, property_id, name, base_price, default_deposit_amount, status,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $6)
       ON CONFLICT (property_id, name) DO UPDATE
       SET base_price = EXCLUDED.base_price,
           default_deposit_amount = EXCLUDED.default_deposit_amount,
           status = EXCLUDED.status,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
      [
        roomType.id,
        CORE_SEED_IDS.granadaProperty,
        roomType.name,
        roomType.basePrice,
        roomType.defaultDepositAmount,
        CORE_SEED_IDS.ownerUser,
      ],
    );
  }
}

async function seedLayer4(client: PoolClient): Promise<void> {
  for (const [id, name] of ROOM_FACILITIES) {
    await client.query(
      `INSERT INTO room_facilities (
         id, property_id, name, status, created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, 'active', $4, $4)
       ON CONFLICT (property_id, name) DO UPDATE
       SET status = EXCLUDED.status,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
      [id, CORE_SEED_IDS.granadaProperty, name, CORE_SEED_IDS.ownerUser],
    );
  }
}

async function seedLayer5(client: PoolClient): Promise<void> {
  for (const room of ROOM_SEEDS) {
    await client.query(
      `INSERT INTO rooms (
         property_id, room_type_id, number, unit_code, gender_policy, monthly_price,
         deposit_amount, room_status, created_by_user_id, updated_by_user_id
       )
       SELECT $1::uuid, room_types.id, $2, $3, $4, 1800000, 0, 'vacant', $5::uuid, $5::uuid
       FROM room_types
       WHERE room_types.property_id = $1::uuid
         AND room_types.name = $6
       ON CONFLICT (property_id, number) DO UPDATE
       SET room_type_id = EXCLUDED.room_type_id,
           unit_code = EXCLUDED.unit_code,
           gender_policy = EXCLUDED.gender_policy,
           monthly_price = EXCLUDED.monthly_price,
           deposit_amount = EXCLUDED.deposit_amount,
           room_status = EXCLUDED.room_status,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
      [
        CORE_SEED_IDS.granadaProperty,
        room.number,
        room.unitCode,
        room.genderPolicy,
        CORE_SEED_IDS.ownerUser,
        room.roomTypeName,
      ],
    );
  }
}

async function seedDevelopmentData(client: PoolClient): Promise<void> {
  for (const resident of DEV_RESIDENT_SEEDS) {
    await client.query(
      `INSERT INTO residents (
         id, property_id, full_name, phone, email, ktp_number, gender, resident_status,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           ktp_number = EXCLUDED.ktp_number,
           gender = EXCLUDED.gender,
           resident_status = EXCLUDED.resident_status,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
      [
        resident.id,
        CORE_SEED_IDS.granadaProperty,
        resident.fullName,
        resident.phone,
        resident.email,
        resident.ktpNumber,
        resident.gender,
        resident.status,
        CORE_SEED_IDS.ownerUser,
      ],
    );

    await client.query('DELETE FROM resident_emergency_contacts WHERE resident_id = $1', [resident.id]);
    await client.query(
      `INSERT INTO resident_emergency_contacts (resident_id, contact_name, relationship, phone)
       VALUES ($1, $2, 'Dummy emergency contact', $3)`,
      [resident.id, resident.emergencyContactName, resident.emergencyContactPhone],
    );
  }

  await client.query(
    `DELETE FROM check_in_records
     WHERE occupancy_id = ANY($1::uuid[])`,
    [DEV_OCCUPANCY_SEEDS.map(({ id }) => id)],
  );
  await client.query(
    `DELETE FROM occupancy_history
     WHERE occupancy_id = ANY($1::uuid[])`,
    [DEV_OCCUPANCY_SEEDS.map(({ id }) => id)],
  );

  for (const occupancy of DEV_OCCUPANCY_SEEDS) {
    const result = await client.query<{ room_id: string; property_id: string }>(
      `SELECT id AS room_id, property_id
       FROM rooms
       WHERE property_id = $1 AND number = $2`,
      [CORE_SEED_IDS.granadaProperty, occupancy.roomNumber],
    );
    const room = result.rows[0];
    if (!room) {
      throw new Error(`Development seed room not found: ${occupancy.roomNumber}.`);
    }

    await client.query(
      `INSERT INTO occupancies (
         id, property_id, room_id, resident_id, start_date, occupancy_status, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 'active', $5)
       ON CONFLICT (id) DO UPDATE
       SET property_id = EXCLUDED.property_id,
           room_id = EXCLUDED.room_id,
           resident_id = EXCLUDED.resident_id,
           start_date = EXCLUDED.start_date,
           end_date = NULL,
           occupancy_status = 'active',
           created_by_user_id = EXCLUDED.created_by_user_id,
           closed_by_user_id = NULL,
           updated_at = now()`,
      [occupancy.id, room.property_id, room.room_id, occupancy.residentId, CORE_SEED_IDS.ownerUser],
    );

    await client.query(
      `INSERT INTO check_in_records (
         property_id, room_id, resident_id, occupancy_id, checked_in_at, handled_by_user_id, notes
       )
       VALUES ($1, $2, $3, $4, now(), $5, 'Seed data - development check-in')`,
      [room.property_id, room.room_id, occupancy.residentId, occupancy.id, CORE_SEED_IDS.ownerUser],
    );

    await client.query(
      `INSERT INTO occupancy_history (
         occupancy_id, property_id, room_id, resident_id, event_type,
         from_status, to_status, event_date, actor_user_id, metadata
       )
       VALUES ($1, $2, $3, $4, 'check_in', NULL, 'active', CURRENT_DATE, $5, $6::jsonb)`,
      [
        occupancy.id,
        room.property_id,
        room.room_id,
        occupancy.residentId,
        CORE_SEED_IDS.ownerUser,
        JSON.stringify({ seed: 'development', source: 'Milestone 5C' }),
      ],
    );

    await client.query(
      `UPDATE rooms
       SET room_status = 'occupied',
           updated_by_user_id = $2,
           updated_at = now()
       WHERE id = $1`,
      [room.room_id, CORE_SEED_IDS.ownerUser],
    );
  }
}

async function countQuery(client: PoolClient, table: string, sql: string, params: unknown[] = []): Promise<SeedCount> {
  const result = await client.query<{ count: string }>(sql, params);
  return { table, count: Number(result.rows[0]?.count ?? 0) };
}

async function validateSeed(client: PoolClient, environment: SeedEnvironment): Promise<SeedCount[]> {
  const owner = ownerIdentityFor(environment);
  const counts = await Promise.all([
    countQuery(client, 'roles', 'SELECT count(*) FROM roles WHERE code = ANY($1::text[])', [ROLES.map(([code]) => code)]),
    countQuery(client, 'permissions', 'SELECT count(*) FROM permissions WHERE code = ANY($1::text[])', [
      PERMISSIONS.map(([code]) => code),
    ]),
    countQuery(
      client,
      'role_permissions',
      `SELECT count(*)
       FROM role_permissions
       JOIN roles ON roles.id = role_permissions.role_id
       JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE (roles.code, permissions.code) IN (
         SELECT * FROM unnest($1::text[], $2::text[])
       )`,
      [ROLE_PERMISSION_GRANTS.map(([roleCode]) => roleCode), ROLE_PERMISSION_GRANTS.map(([, permissionCode]) => permissionCode)],
    ),
    countQuery(client, 'users', 'SELECT count(*) FROM users WHERE email = $1 AND user_status = $2', [owner.email, 'active']),
    countQuery(
      client,
      'user_property_roles',
      `SELECT count(*)
       FROM user_property_roles
       JOIN roles ON roles.id = user_property_roles.role_id
       WHERE user_property_roles.user_id = $1
         AND user_property_roles.property_id IS NULL
         AND user_property_roles.revoked_at IS NULL
         AND roles.code = 'owner'`,
      [CORE_SEED_IDS.ownerUser],
    ),
    countQuery(client, 'properties', 'SELECT count(*) FROM properties WHERE id = $1 AND status = $2', [
      CORE_SEED_IDS.granadaProperty,
      'active',
    ]),
    countQuery(client, 'property_settings', 'SELECT count(*) FROM property_settings WHERE property_id = $1', [
      CORE_SEED_IDS.granadaProperty,
    ]),
    countQuery(
      client,
      'room_types',
      'SELECT count(*) FROM room_types WHERE property_id = $1 AND name = ANY($2::text[]) AND status = $3',
      [CORE_SEED_IDS.granadaProperty, ROOM_TYPES.map(({ name }) => name), 'active'],
    ),
    countQuery(
      client,
      'room_facilities',
      'SELECT count(*) FROM room_facilities WHERE property_id = $1 AND name = ANY($2::text[]) AND status = $3',
      [CORE_SEED_IDS.granadaProperty, ROOM_FACILITIES.map(([, name]) => name), 'active'],
    ),
  ]);

  const expected = new Map<string, number>([
    ['roles', ROLES.length],
    ['permissions', PERMISSIONS.length],
    ['role_permissions', ROLE_PERMISSION_GRANTS.length],
    ['users', 1],
    ['user_property_roles', 1],
    ['properties', 1],
    ['property_settings', 1],
    ['room_types', ROOM_TYPES.length],
    ['room_facilities', ROOM_FACILITIES.length],
  ]);

  for (const count of counts) {
    const expectedCount = expected.get(count.table);
    if (expectedCount !== count.count) {
      throw new Error(`Seed validation failed for ${count.table}: expected ${expectedCount}, got ${count.count}.`);
    }
  }

  return counts;
}

async function validationCheck(
  client: PoolClient,
  check: string,
  sql: string,
  params: unknown[] = [],
): Promise<ValidationCheck> {
  const result = await client.query<{ count: string }>(sql, params);
  return { check, count: Number(result.rows[0]?.count ?? 0) };
}

async function validateLayer5(client: PoolClient, requireNoDevelopmentData: boolean): Promise<ValidationCheck[]> {
  const propertyId = CORE_SEED_IDS.granadaProperty;
  const checksToRun: Array<Promise<ValidationCheck>> = [
    validationCheck(client, 'POST-L5-01 total rooms', 'SELECT count(*) FROM rooms WHERE property_id = $1', [propertyId]),
    validationCheck(
      client,
      'POST-L5-02 RuKost rooms',
      `SELECT count(*)
       FROM rooms
       JOIN room_types ON room_types.id = rooms.room_type_id
       WHERE rooms.property_id = $1 AND room_types.name = 'RuKost Standard'`,
      [propertyId],
    ),
    validationCheck(
      client,
      'POST-L5-03 ApartKost rooms',
      `SELECT count(*)
       FROM rooms
       JOIN room_types ON room_types.id = rooms.room_type_id
       WHERE rooms.property_id = $1 AND room_types.name = 'ApartKost Standard'`,
      [propertyId],
    ),
    validationCheck(client, 'POST-L5-04 gender male count', "SELECT count(*) FROM rooms WHERE property_id = $1 AND gender_policy = 'male'", [
      propertyId,
    ]),
    validationCheck(
      client,
      'POST-L5-05 gender female count',
      "SELECT count(*) FROM rooms WHERE property_id = $1 AND gender_policy = 'female'",
      [propertyId],
    ),
    validationCheck(client, 'POST-L5-06 gender mixed count', "SELECT count(*) FROM rooms WHERE property_id = $1 AND gender_policy = 'mixed'", [
      propertyId,
    ]),
    validationCheck(client, 'POST-L5-07 all rooms vacant', "SELECT count(*) FROM rooms WHERE property_id = $1 AND room_status = 'vacant'", [
      propertyId,
    ]),
    validationCheck(
      client,
      'POST-L5-08 all monthly_price = 1800000',
      'SELECT count(*) FROM rooms WHERE property_id = $1 AND monthly_price = 1800000',
      [propertyId],
    ),
    validationCheck(
      client,
      'POST-L5-09 all deposit_amount = 0',
      'SELECT count(*) FROM rooms WHERE property_id = $1 AND deposit_amount = 0',
      [propertyId],
    ),
    validationCheck(
      client,
      'POST-L5-10 duplicate room numbers',
      `SELECT count(*)
       FROM (
         SELECT number
         FROM rooms
         WHERE property_id = $1
         GROUP BY property_id, number
         HAVING count(*) > 1
       ) duplicates`,
      [propertyId],
    ),
    validationCheck(client, 'POST-L5-11 all rooms have unit_code', 'SELECT count(*) FROM rooms WHERE property_id = $1 AND unit_code IS NOT NULL', [
      propertyId,
    ]),
    validationCheck(client, 'POST-L5-12 unique unit codes', 'SELECT count(DISTINCT unit_code) FROM rooms WHERE property_id = $1', [
      propertyId,
    ]),
    validationCheck(
      client,
      'POST-L5-13 gender consistency per unit violations',
      `SELECT count(*)
       FROM (
         SELECT unit_code
         FROM rooms
         WHERE property_id = $1
         GROUP BY property_id, unit_code
         HAVING count(DISTINCT gender_policy) > 1
       ) violations`,
      [propertyId],
    ),
    validationCheck(client, 'POST-L5-14 all rooms have room_type_id', 'SELECT count(*) FROM rooms WHERE property_id = $1 AND room_type_id IS NOT NULL', [
      propertyId,
    ]),
  ];

  if (requireNoDevelopmentData) {
    checksToRun.push(
      validationCheck(client, 'POST-L5-15 no occupancies exist', 'SELECT count(*) FROM occupancies'),
      validationCheck(client, 'POST-L5-16 no residents exist', 'SELECT count(*) FROM residents'),
    );
  }

  const checks = await Promise.all(checksToRun);

  const expected = new Map<string, number>([
    ['POST-L5-01 total rooms', 163],
    ['POST-L5-02 RuKost rooms', 123],
    ['POST-L5-03 ApartKost rooms', 40],
    ['POST-L5-04 gender male count', 81],
    ['POST-L5-05 gender female count', 82],
    ['POST-L5-06 gender mixed count', 0],
    ['POST-L5-07 all rooms vacant', 163],
    ['POST-L5-08 all monthly_price = 1800000', 163],
    ['POST-L5-09 all deposit_amount = 0', 163],
    ['POST-L5-10 duplicate room numbers', 0],
    ['POST-L5-11 all rooms have unit_code', 163],
    ['POST-L5-12 unique unit codes', 26],
    ['POST-L5-13 gender consistency per unit violations', 0],
    ['POST-L5-14 all rooms have room_type_id', 163],
  ]);
  if (requireNoDevelopmentData) {
    expected.set('POST-L5-15 no occupancies exist', 0);
    expected.set('POST-L5-16 no residents exist', 0);
  }

  for (const check of checks) {
    const expectedCount = expected.get(check.check);
    if (expectedCount !== check.count) {
      throw new Error(`${check.check} failed: expected ${expectedCount}, got ${check.count}.`);
    }
  }

  return checks;
}

async function validateDevelopmentSeed(client: PoolClient): Promise<ValidationCheck[]> {
  const propertyId = CORE_SEED_IDS.granadaProperty;
  const checks = await Promise.all([
    validationCheck(client, 'DEV-01 resident count', 'SELECT count(*) FROM residents WHERE property_id = $1', [propertyId]),
    validationCheck(
      client,
      'DEV-02 emergency contact count',
      `SELECT count(*)
       FROM resident_emergency_contacts
       JOIN residents ON residents.id = resident_emergency_contacts.resident_id
       WHERE residents.property_id = $1`,
      [propertyId],
    ),
    validationCheck(
      client,
      'DEV-03 occupancy count',
      "SELECT count(*) FROM occupancies WHERE property_id = $1 AND occupancy_status = 'active'",
      [propertyId],
    ),
    validationCheck(client, 'DEV-04 check-in record count', 'SELECT count(*) FROM check_in_records WHERE property_id = $1', [propertyId]),
    validationCheck(client, 'DEV-05 occupancy history count', 'SELECT count(*) FROM occupancy_history WHERE property_id = $1', [propertyId]),
    validationCheck(client, 'DEV-06 occupied rooms', "SELECT count(*) FROM rooms WHERE property_id = $1 AND room_status = 'occupied'", [propertyId]),
    validationCheck(client, 'DEV-07 vacant rooms', "SELECT count(*) FROM rooms WHERE property_id = $1 AND room_status = 'vacant'", [propertyId]),
    validationCheck(
      client,
      'DEV-08 room status sync violations',
      `SELECT count(*)
       FROM occupancies
       JOIN rooms ON rooms.id = occupancies.room_id
       WHERE occupancies.property_id = $1
         AND occupancies.occupancy_status = 'active'
         AND rooms.room_status <> 'occupied'`,
      [propertyId],
    ),
    validationCheck(
      client,
      'DEV-09 active occupancy count',
      "SELECT count(*) FROM occupancies WHERE property_id = $1 AND occupancy_status = 'active' AND end_date IS NULL",
      [propertyId],
    ),
    validationCheck(
      client,
      'DEV-10 gender compatibility violations',
      `SELECT count(*)
       FROM occupancies
       JOIN residents ON residents.id = occupancies.resident_id
       JOIN rooms ON rooms.id = occupancies.room_id
       WHERE occupancies.property_id = $1
         AND occupancies.occupancy_status = 'active'
         AND residents.gender <> rooms.gender_policy`,
      [propertyId],
    ),
  ]);

  const expected = new Map<string, number>([
    ['DEV-01 resident count', 10],
    ['DEV-02 emergency contact count', 10],
    ['DEV-03 occupancy count', 8],
    ['DEV-04 check-in record count', 8],
    ['DEV-05 occupancy history count', 8],
    ['DEV-06 occupied rooms', 8],
    ['DEV-07 vacant rooms', 155],
    ['DEV-08 room status sync violations', 0],
    ['DEV-09 active occupancy count', 8],
    ['DEV-10 gender compatibility violations', 0],
  ]);

  for (const check of checks) {
    const expectedCount = expected.get(check.check);
    if (expectedCount !== check.count) {
      throw new Error(`${check.check} failed: expected ${expectedCount}, got ${check.count}.`);
    }
  }

  return checks;
}

async function main(): Promise<void> {
  const environment = resolveSeedEnvironment();
  const seedDevelopment = shouldSeedDevelopmentData(environment);
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await seedLayer0(client, environment);
    await seedLayer1(client);
    await seedLayer2(client);
    await seedLayer3(client);
    await seedLayer4(client);
    await seedLayer5(client);
    const counts = await validateSeed(client, environment);
    const layer5Checks = await validateLayer5(client, !seedDevelopment);
    let devChecks: ValidationCheck[] = [];
    if (seedDevelopment) {
      await seedDevelopmentData(client);
      devChecks = await validateDevelopmentSeed(client);
    }
    await client.query('COMMIT');

    console.log(`Core seed applied for ${environment}.`);
    for (const { table, count } of counts) {
      console.log(`${table}: ${count}`);
    }
    for (const { check, count } of layer5Checks) {
      console.log(`${check}: ${count}`);
    }
    for (const { check, count } of devChecks) {
      console.log(`${check}: ${count}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
