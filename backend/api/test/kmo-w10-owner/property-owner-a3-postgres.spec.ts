import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PropertyOwnerPortalService } from '../../src/modules/property-owner-management/property-owner-portal.service';

const root = resolve(__dirname, '../..');
const propertyId = '11111111-1111-4111-8111-111111111111';
const roomId = '22222222-2222-4222-8222-222222222222';
const leaseId = '33333333-3333-4333-8333-333333333333';
const ownerARoomId = '24242424-2424-4242-8242-242424242424';
const ownerBRoomId = '25252525-2525-4252-8252-252525252525';
const advanceRoomId = '26262626-2626-4262-8262-262626262624';
const orphanRoomId = '27272727-2727-4272-8272-272727272724';
const capRoomId = '28282828-2828-4282-8282-282828282824';
const ownerALeaseId = '26262626-2626-4262-8262-262626262626';
const ownerBLeaseId = '27272727-2727-4272-8272-272727272727';
const advanceLeaseId = '28282828-2828-4282-8282-282828282828';
const orphanLeaseId = '29292929-2929-4292-8292-292929292928';
const capLeaseId = '30303030-3030-4030-8030-303030303038';
const ownerAUserId = '44444444-4444-4444-8444-444444444444';
const ownerBUserId = '55555555-5555-4555-8555-555555555555';
const ownerAId = '66666666-6666-4666-8666-666666666666';
const ownerBId = '77777777-7777-4777-8777-777777777777';

const actor = (id: string): UserAccessContext => ({
  id,
  email: `${id}@owner.test`,
  phone: null,
  displayName: 'Owner',
  roles: ['property_owner'],
  permissions: [
    'property_owner.asset.read',
    'property_owner.finance.read',
    'property_owner.complaint.read',
    'property_owner.maintenance.read',
    'property_owner.notification.read',
    'property_owner.report.view',
  ],
  propertyIds: [],
  sessionId: `session-${id}`,
});

function postgres(bin: string, name: string): string {
  return join(bin, process.platform === 'win32' ? `${name}.exe` : name);
}

function ownerReportErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  if (!response || typeof response !== 'object') return undefined;
  const code = (response as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

void test(
  'migration 037 applies, replays, enforces exact service coverage, rolls back, and cleans a disposable PostgreSQL cluster',
  { skip: !process.env.KOSTATION_POSTGRES_BIN },
  async () => {
    const bin = process.env.KOSTATION_POSTGRES_BIN!;
    const migration035 = readFileSync(
      resolve(root, 'src/infrastructure/database/migrations/035_property_owner_management.sql'),
      'utf8',
    );
    const migration036 = readFileSync(
      resolve(
        root,
        'src/infrastructure/database/migrations/036_property_owner_authority_hardening.sql',
      ),
      'utf8',
    );
    const migration037 = readFileSync(
      resolve(
        root,
        'src/infrastructure/database/migrations/037_property_owner_service_coverage_authority.sql',
      ),
      'utf8',
    );
    const replayDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-a3-replay-'));
    const rollbackDirectory = mkdtempSync(join(tmpdir(), 'kostation-w10-owner-a3-rollback-'));
    const createdDirectories = [replayDirectory, rollbackDirectory];
    const init = (directory: string) => {
      const result = spawnSync(
        postgres(bin, 'initdb'),
        ['-D', directory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'],
        { encoding: 'utf8', windowsHide: true },
      );
      assert.equal(result.status, 0, `initdb failed: ${result.stderr}`);
    };
    const portFor = () => 59000 + Math.floor(Math.random() * 500);
    const start = async (directory: string, port: number) => {
      const process = spawn(
        postgres(bin, 'pg_ctl'),
        ['-D', directory, '-o', `-h 127.0.0.1 -p ${port}`, '-W', 'start'],
        { detached: true, stdio: 'ignore', windowsHide: true },
      );
      process.unref();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (
          spawnSync(
            postgres(bin, 'pg_isready'),
            ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres'],
            {
              windowsHide: true,
            },
          ).status === 0
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail('disposable PostgreSQL did not become ready');
    };
    const stop = async (directory: string, port: number) => {
      const process = spawn(
        postgres(bin, 'pg_ctl'),
        ['-D', directory, '-m', 'immediate', '-W', 'stop'],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      process.unref();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (
          spawnSync(
            postgres(bin, 'pg_isready'),
            ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres'],
            {
              windowsHide: true,
            },
          ).status !== 0
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail('disposable PostgreSQL did not stop');
    };
    const prelude = `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE users (id UUID PRIMARY KEY, email TEXT, phone TEXT, password_hash TEXT, display_name TEXT, user_status TEXT, password_changed_at TIMESTAMPTZ);
      CREATE TABLE roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, is_system_role BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE permissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT);
      CREATE TABLE role_permissions (role_id UUID NOT NULL REFERENCES roles(id), permission_id UUID NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
      CREATE TABLE room_buildings (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_code TEXT, building_name TEXT, category TEXT, gender_policy TEXT);
      CREATE TABLE rooms (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), building_id UUID REFERENCES room_buildings(id), room_code TEXT, category TEXT, gender_policy TEXT, room_status TEXT);
      CREATE TABLE residents (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), full_name TEXT NOT NULL);
      CREATE TABLE occupancies (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), room_id UUID NOT NULL REFERENCES rooms(id), resident_id UUID NOT NULL REFERENCES residents(id), start_date DATE NOT NULL, end_date DATE, occupancy_status TEXT NOT NULL);
      CREATE TABLE leases (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), room_id UUID NOT NULL REFERENCES rooms(id), resident_id UUID NOT NULL REFERENCES residents(id), occupancy_id UUID REFERENCES occupancies(id), lease_status TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE, activated_at TIMESTAMPTZ);
      CREATE TABLE payments (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), resident_id UUID REFERENCES residents(id), lease_id UUID REFERENCES leases(id), payment_purpose TEXT, payment_status TEXT, amount BIGINT);
      CREATE TABLE complaints (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), room_id UUID REFERENCES rooms(id), complaint_code TEXT, complaint_status TEXT, priority TEXT, created_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE maintenance_work_orders (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), room_id UUID REFERENCES rooms(id), work_order_code TEXT, work_order_status TEXT, priority TEXT, created_at TIMESTAMPTZ NOT NULL);
      CREATE TABLE invoices (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), resident_id UUID NOT NULL REFERENCES residents(id), room_id UUID NOT NULL REFERENCES rooms(id), occupancy_id UUID REFERENCES occupancies(id), lease_id UUID REFERENCES leases(id), invoice_purpose TEXT, invoice_status TEXT, cycle_start_date DATE, cycle_end_date DATE);
      CREATE TABLE payment_allocations (id UUID PRIMARY KEY, payment_id UUID NOT NULL REFERENCES payments(id), target_type TEXT NOT NULL, target_id UUID NOT NULL, invoice_id UUID REFERENCES invoices(id), lease_id UUID REFERENCES leases(id), allocation_purpose TEXT, allocation_status TEXT NOT NULL, allocated_amount BIGINT NOT NULL);
      CREATE TABLE payment_reversal_allocations (id UUID PRIMARY KEY, original_allocation_id UUID NOT NULL REFERENCES payment_allocations(id));
      CREATE TABLE notifications (id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), recipient_user_id UUID NOT NULL REFERENCES users(id), notification_type TEXT NOT NULL, notification_status TEXT NOT NULL, priority TEXT NOT NULL, title TEXT NOT NULL, source_event_type TEXT, source_resource_id UUID, created_at TIMESTAMPTZ NOT NULL);
      INSERT INTO properties (id) VALUES ('${propertyId}');
      INSERT INTO roles (code, name) VALUES ('owner', 'Owner'), ('manager', 'Manager'), ('admin', 'Admin');
      INSERT INTO permissions (code, name) VALUES ('property.read', 'Property read'), ('room.read', 'Room read'), ('resident.read', 'Resident read'), ('billing.read', 'Billing read');
      INSERT INTO users (id, email, display_name, user_status) VALUES
        ('${ownerAUserId}', 'owner-a@test', 'Owner A', 'active'),
        ('${ownerBUserId}', 'owner-b@test', 'Owner B', 'active');
      INSERT INTO room_buildings (id, property_id, building_code, building_name, category) VALUES
        ('88888888-8888-4888-8888-888888888888', '${propertyId}', 'AK-01', 'Apart Kost', 'apartkost');
      INSERT INTO rooms (id, property_id, building_id, room_code, category, room_status) VALUES
         ('${roomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-01', 'apartkost', 'occupied'),
         ('${ownerARoomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-02', 'apartkost', 'vacant'),
         ('${ownerBRoomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-03', 'apartkost', 'vacant'),
         ('${advanceRoomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-04', 'apartkost', 'vacant'),
         ('${orphanRoomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-05', 'apartkost', 'vacant'),
         ('${capRoomId}', '${propertyId}', '88888888-8888-4888-8888-888888888888', 'AK-01-06', 'apartkost', 'vacant');
      INSERT INTO residents (id, property_id, full_name) VALUES
         ('99999999-9999-4999-8999-999999999991', '${propertyId}', 'Resident A'),
         ('99999999-9999-4999-8999-999999999992', '${propertyId}', 'Resident B'),
         ('99999999-9999-4999-8999-999999999993', '${propertyId}', 'Resident C'),
         ('99999999-9999-4999-8999-999999999994', '${propertyId}', 'Resident D'),
         ('99999999-9999-4999-8999-999999999995', '${propertyId}', 'Resident E'),
         ('99999999-9999-4999-8999-999999999996', '${propertyId}', 'Resident F');
      INSERT INTO occupancies (id, property_id, room_id, resident_id, start_date, end_date, occupancy_status) VALUES
         ('99999999-9999-4999-8999-999999999999', '${propertyId}', '${roomId}', '99999999-9999-4999-8999-999999999991', '2026-08-01', '2026-08-31', 'ended'),
         ('29292929-2929-4292-8292-292929292921', '${propertyId}', '${ownerARoomId}', '99999999-9999-4999-8999-999999999992', '2026-08-01', NULL, 'active'),
         ('29292929-2929-4292-8292-292929292922', '${propertyId}', '${ownerBRoomId}', '99999999-9999-4999-8999-999999999993', '2026-08-01', NULL, 'active'),
         ('29292929-2929-4292-8292-292929292923', '${propertyId}', '${advanceRoomId}', '99999999-9999-4999-8999-999999999994', '2026-08-10', '2026-09-20', 'ended'),
         ('29292929-2929-4292-8292-292929292924', '${propertyId}', '${capRoomId}', '99999999-9999-4999-8999-999999999996', '2026-08-01', '2026-08-31', 'ended');
      INSERT INTO leases (id, property_id, room_id, resident_id, occupancy_id, lease_status, start_date, end_date, activated_at) VALUES
         ('${leaseId}', '${propertyId}', '${roomId}', '99999999-9999-4999-8999-999999999991', '99999999-9999-4999-8999-999999999999', 'ended', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00Z'),
         ('${ownerALeaseId}', '${propertyId}', '${ownerARoomId}', '99999999-9999-4999-8999-999999999992', '29292929-2929-4292-8292-292929292921', 'active', '2026-08-01', NULL, '2026-08-01T00:00:00Z'),
         ('${ownerBLeaseId}', '${propertyId}', '${ownerBRoomId}', '99999999-9999-4999-8999-999999999993', '29292929-2929-4292-8292-292929292922', 'active', '2026-08-01', NULL, '2026-08-01T00:00:00Z'),
         ('${advanceLeaseId}', '${propertyId}', '${advanceRoomId}', '99999999-9999-4999-8999-999999999994', '29292929-2929-4292-8292-292929292923', 'active', '2026-08-10', '2026-09-20', '2026-08-10T00:00:00Z'),
         ('${orphanLeaseId}', '${propertyId}', '${orphanRoomId}', '99999999-9999-4999-8999-999999999995', NULL, 'active', '2026-08-01', NULL, '2026-08-01T00:00:00Z'),
         ('${capLeaseId}', '${propertyId}', '${capRoomId}', '99999999-9999-4999-8999-999999999996', '29292929-2929-4292-8292-292929292924', 'ended', '2026-08-01', '2026-08-31', '2026-08-01T00:00:00Z');
    `;
    let replayPort: number | null = null;
    let rollbackPort: number | null = null;
    let replayPool: Pool | undefined;
    let rollbackPool: Pool | undefined;
    try {
      init(replayDirectory);
      replayPort = portFor();
      await start(replayDirectory, replayPort);
      replayPool = new Pool({
        host: '127.0.0.1',
        port: replayPort,
        user: 'postgres',
        database: 'postgres',
      });
      await replayPool.query(`${prelude}\n${migration035}\n${migration036}\n${migration037}`);
      await replayPool.query(migration037);
      await replayPool.query(`
        UPDATE property_owner_commercial_policies
        SET effective_from = '2026-01-01'
        WHERE property_id = '${propertyId}' AND policy_status = 'active';
        INSERT INTO property_owner_profiles (id, property_id, user_id, full_name, email) VALUES
          ('${ownerAId}', '${propertyId}', '${ownerAUserId}', 'Owner A', 'owner-a@test'),
          ('${ownerBId}', '${propertyId}', '${ownerBUserId}', 'Owner B', 'owner-b@test');
        INSERT INTO room_owner_assignments (id, property_id, owner_profile_id, room_id, effective_from, effective_until, assignment_status, reason) VALUES
           ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${propertyId}', '${ownerAId}', '${roomId}', '2026-08-01', '2026-08-16', 'released', 'Mid-month transfer to Owner B'),
           ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${propertyId}', '${ownerBId}', '${roomId}', '2026-08-16', NULL, 'active', 'Mid-month transfer from Owner A'),
           ('28282828-2828-4282-8282-282828282828', '${propertyId}', '${ownerAId}', '${ownerARoomId}', '2026-08-01', NULL, 'active', 'Owner A control room'),
           ('29292929-2929-4292-8292-292929292929', '${propertyId}', '${ownerBId}', '${ownerBRoomId}', '2026-08-01', NULL, 'active', 'Owner B control room'),
           ('34343434-3434-4434-8434-343434343435', '${propertyId}', '${ownerAId}', '${advanceRoomId}', '2026-08-10', NULL, 'active', 'Advance allocation room'),
           ('34343434-3434-4434-8434-343434343436', '${propertyId}', '${ownerAId}', '${capRoomId}', '2026-08-01', NULL, 'active', 'Allocation cap room'),
           ('34343434-3434-4434-8434-343434343437', '${propertyId}', '${ownerAId}', '${orphanRoomId}', '2026-08-01', NULL, 'active', 'No occupancy room');
         INSERT INTO payments (id, property_id, resident_id, lease_id, payment_purpose, payment_status, amount) VALUES
           ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${propertyId}', '99999999-9999-4999-8999-999999999991', '${leaseId}', 'rent', 'verified', 3100),
           ('30303030-3030-4030-8030-303030303030', '${propertyId}', '99999999-9999-4999-8999-999999999992', '${ownerALeaseId}', 'rent', 'verified', 3100),
           ('31313131-3131-4131-8131-313131313131', '${propertyId}', '99999999-9999-4999-8999-999999999993', '${ownerBLeaseId}', 'rent', 'verified', 3100),
           ('34343434-3434-4434-8434-343434343434', '${propertyId}', '99999999-9999-4999-8999-999999999991', '${leaseId}', 'rent', 'verified', 3100),
            ('35353535-3535-4535-8535-353535353535', '${propertyId}', '99999999-9999-4999-8999-999999999994', '${advanceLeaseId}', 'rent', 'verified', 4200),
            ('36363636-3636-4636-8636-363636363636', '${propertyId}', '99999999-9999-4999-8999-999999999996', '${capLeaseId}', 'rent', 'verified', 1000),
            ('37373737-3737-4737-8737-373737373737', '${propertyId}', '99999999-9999-4999-8999-999999999995', '${orphanLeaseId}', 'rent', 'verified', 1000),
            ('38383838-3838-4838-8838-383838383838', '${propertyId}', '99999999-9999-4999-8999-999999999991', '${leaseId}', 'rent', 'verified', 900);
         INSERT INTO invoices (id, property_id, resident_id, room_id, occupancy_id, lease_id, invoice_purpose, invoice_status, cycle_start_date, cycle_end_date) VALUES
           ('40404040-4040-4040-8040-404040404040', '${propertyId}', '99999999-9999-4999-8999-999999999991', '${roomId}', '99999999-9999-4999-8999-999999999999', '${leaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31'),
           ('41414141-4141-4141-8141-414141414141', '${propertyId}', '99999999-9999-4999-8999-999999999992', '${ownerARoomId}', '29292929-2929-4292-8292-292929292921', '${ownerALeaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31'),
           ('42424242-4242-4242-8242-424242424242', '${propertyId}', '99999999-9999-4999-8999-999999999993', '${ownerBRoomId}', '29292929-2929-4292-8292-292929292922', '${ownerBLeaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31'),
           ('43434343-4343-4343-8343-434343434343', '${propertyId}', '99999999-9999-4999-8999-999999999994', '${advanceRoomId}', '29292929-2929-4292-8292-292929292923', '${advanceLeaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31'),
           ('44444444-4444-4444-8444-444444444445', '${propertyId}', '99999999-9999-4999-8999-999999999994', '${advanceRoomId}', '29292929-2929-4292-8292-292929292923', '${advanceLeaseId}', 'rent', 'paid', '2026-09-01', '2026-09-30'),
           ('45454545-4545-4545-8545-454545454545', '${propertyId}', '99999999-9999-4999-8999-999999999996', '${capRoomId}', '29292929-2929-4292-8292-292929292924', '${capLeaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31'),
           ('46464646-4646-4646-8646-464646464646', '${propertyId}', '99999999-9999-4999-8999-999999999995', '${orphanRoomId}', NULL, '${orphanLeaseId}', 'rent', 'paid', '2026-08-01', '2026-08-31');
         INSERT INTO payment_allocations (id, payment_id, target_type, target_id, invoice_id, lease_id, allocation_purpose, allocation_status, allocated_amount) VALUES
           ('50505050-5050-4050-8050-505050505050', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'invoice', '40404040-4040-4040-8040-404040404040', '40404040-4040-4040-8040-404040404040', '${leaseId}', 'rent', 'active', 3100),
           ('51515151-5151-4151-8151-515151515151', '30303030-3030-4030-8030-303030303030', 'invoice', '41414141-4141-4141-8141-414141414141', '41414141-4141-4141-8141-414141414141', '${ownerALeaseId}', 'rent', 'active', 3100),
           ('52525252-5252-4252-8252-525252525252', '31313131-3131-4131-8131-313131313131', 'invoice', '42424242-4242-4242-8242-424242424242', '42424242-4242-4242-8242-424242424242', '${ownerBLeaseId}', 'rent', 'active', 3100),
           ('53535353-5353-4353-8353-535353535353', '35353535-3535-4535-8535-353535353535', 'invoice', '43434343-4343-4343-8343-434343434343', '43434343-4343-4343-8343-434343434343', '${advanceLeaseId}', 'rent', 'active', 2200),
           ('54545454-5454-4454-8454-545454545454', '35353535-3535-4535-8535-353535353535', 'invoice', '44444444-4444-4444-8444-444444444445', '44444444-4444-4444-8444-444444444445', '${advanceLeaseId}', 'rent', 'active', 2000),
            ('55555555-5555-4555-8555-555555555556', '36363636-3636-4636-8636-363636363636', 'invoice', '45454545-4545-4545-8545-454545454545', '45454545-4545-4545-8545-454545454545', '${capLeaseId}', 'rent', 'active', 1000),
            ('56565656-5656-4656-8656-565656565656', '37373737-3737-4737-8737-373737373737', 'invoice', '46464646-4646-4646-8646-464646464646', '46464646-4646-4646-8646-464646464646', '${orphanLeaseId}', 'rent', 'active', 1000),
            ('67676767-6767-4767-8767-676767676767', '38383838-3838-4838-8838-383838383838', 'invoice', '40404040-4040-4040-8040-404040404040', '40404040-4040-4040-8040-404040404040', '${leaseId}', 'rent', 'active', 900),
            ('57575757-5757-4757-8757-575757575757', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'invoice', '40404040-4040-4040-8040-404040404040', '40404040-4040-4040-8040-404040404040', '${leaseId}', 'rent', 'reversed', 3100),
           ('58585858-5858-4858-8858-585858585858', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'invoice', '40404040-4040-4040-8040-404040404040', '40404040-4040-4040-8040-404040404040', '${leaseId}', 'rent', 'inactive', 3100);
         INSERT INTO payment_reversal_allocations (id, original_allocation_id) VALUES
           ('59595959-5959-4959-8959-595959595959', '57575757-5757-4757-8757-575757575757');
       `);
      const policy = (
        await replayPool.query<{ id: string }>(
          `SELECT id FROM property_owner_commercial_policies WHERE property_id = '${propertyId}'`,
        )
      ).rows[0];
      assert.ok(policy);
      const coverageClient = await replayPool.connect();
      try {
        await coverageClient.query('BEGIN');
        await coverageClient.query(
          `INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
           VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', $1, $2, 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', $3, $4, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '50505050-5050-4050-8050-505050505050', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, $5),
                   ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', $1, $6, 'room', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $3, $4, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '50505050-5050-4050-8050-505050505050', '2026-08-01', '2026-08-16', '2026-09-01', 1600, 1280, 320, $5)`,
          [propertyId, ownerAId, roomId, leaseId, policy.id, ownerBId],
        );
        await coverageClient.query(
          `INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
           VALUES ('32323232-3232-4232-8232-323232323232', $1, $2, 'room', '28282828-2828-4282-8282-282828282828', $3, $4, '30303030-3030-4030-8030-303030303030', '51515151-5151-4151-8151-515151515151', '2026-08-01', '2026-08-01', '2026-09-01', 3100, 2480, 620, $5),
                  ('33333333-3333-4333-8333-333333333333', $1, $6, 'room', '29292929-2929-4292-8292-292929292929', $7, $8, '31313131-3131-4131-8131-313131313131', '52525252-5252-4252-8252-525252525252', '2026-08-01', '2026-08-01', '2026-09-01', 3100, 2480, 620, $5)`,
          [
            propertyId,
            ownerAId,
            ownerARoomId,
            ownerALeaseId,
            policy.id,
            ownerBId,
            ownerBRoomId,
            ownerBLeaseId,
          ],
        );
        await coverageClient.query(
          `INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
           VALUES ('68686868-6868-4868-8868-686868686868', $1, $2, 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', $3, $4, '38383838-3838-4838-8838-383838383838', '67676767-6767-4767-8767-676767676767', '2026-08-01', '2026-08-01', '2026-08-16', 400, 320, 80, $5),
                  ('69696969-6969-4969-8969-696969696969', $1, $6, 'room', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $3, $4, '38383838-3838-4838-8838-383838383838', '67676767-6767-4767-8767-676767676767', '2026-08-01', '2026-08-16', '2026-09-01', 500, 400, 100, $5)`,
          [propertyId, ownerAId, roomId, leaseId, policy.id, ownerBId],
        );
        await coverageClient.query(
          `INSERT INTO property_owner_earnings (id, property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
           VALUES ('60606060-6060-4060-8060-606060606060', $1, $2, 'room', '34343434-3434-4434-8434-343434343435', $3, $4, '35353535-3535-4535-8535-353535353535', '53535353-5353-4353-8353-535353535353', '2026-08-01', '2026-08-10', '2026-09-01', 2200, 1760, 440, $5),
                  ('61616161-6161-4161-8161-616161616161', $1, $2, 'room', '34343434-3434-4434-8434-343434343435', $3, $4, '35353535-3535-4535-8535-353535353535', '54545454-5454-4454-8454-545454545454', '2026-09-01', '2026-09-01', '2026-09-21', 2000, 1600, 400, $5)`,
          [propertyId, ownerAId, advanceRoomId, advanceLeaseId, policy.id],
        );
        await coverageClient.query('COMMIT');
      } finally {
        coverageClient.release();
      }
      const duplicate = await replayPool
        .query(
          `
        INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
        VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '50505050-5050-4050-8050-505050505050', '2026-08-01', '2026-08-15', '2026-08-16', 100, 80, 20, '${policy.id}')
      `,
        )
        .catch((error: unknown) => error as Error);
      assert.ok(duplicate instanceof Error);
      assert.match(duplicate.message, /property_owner_earnings_service_coverage_no_overlap/);

      const rejected = async (sql: string, code: RegExp) => {
        const error = await replayPool!.query(sql).catch((value: unknown) => value as Error);
        assert.ok(error instanceof Error);
        assert.match(error.message, code);
      };
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', '34343434-3434-4434-8434-343434343434', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_REQUIRED/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', '30303030-3030-4030-8030-303030303030', '51515151-5151-4151-8151-515151515151', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '51515151-5151-4151-8151-515151515151', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '57575757-5757-4757-8757-575757575757', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${roomId}', '${leaseId}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '58585858-5858-4858-8858-585858585858', '2026-08-01', '2026-08-01', '2026-08-16', 1500, 1200, 300, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', '34343434-3434-4434-8434-343434343437', '${orphanRoomId}', '${orphanLeaseId}', '37373737-3737-4737-8737-373737373737', '56565656-5656-4656-8656-565656565656', '2026-08-01', '2026-08-01', '2026-09-01', 1000, 800, 200, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_PAYMENT_ALLOCATION_UNAVAILABLE/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', '34343434-3434-4434-8434-343434343435', '${advanceRoomId}', '${advanceLeaseId}', '35353535-3535-4535-8535-353535353535', '53535353-5353-4353-8353-535353535353', '2026-08-01', '2026-08-01', '2026-09-01', 2200, 1760, 440, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH/,
      );
      await rejected(
        `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
         VALUES ('${propertyId}', '${ownerAId}', 'room', '34343434-3434-4434-8434-343434343435', '${advanceRoomId}', '${advanceLeaseId}', '35353535-3535-4535-8535-353535353535', '54545454-5454-4454-8454-545454545454', '2026-09-01', '2026-09-01', '2026-09-22', 2000, 1600, 400, '${policy.id}')`,
        /PROPERTY_OWNER_EARNING_SERVICE_LIFECYCLE_MISMATCH/,
      );
      const capClient = await replayPool.connect();
      try {
        await capClient.query('BEGIN');
        await capClient.query(
          `INSERT INTO property_owner_earnings (property_id, owner_profile_id, ownership_kind, ownership_assignment_id, room_id, lease_id, payment_id, payment_allocation_id, earning_month, service_from, service_until, gross_collected_amount, owner_earned_amount, operator_fee_amount, policy_id)
           VALUES ('${propertyId}', '${ownerAId}', 'room', '34343434-3434-4434-8434-343434343436', '${capRoomId}', '${capLeaseId}', '36363636-3636-4636-8636-363636363636', '55555555-5555-4555-8555-555555555556', '2026-08-01', '2026-08-01', '2026-09-01', 1001, 801, 200, '${policy.id}')`,
        );
        await assert.rejects(
          capClient.query('COMMIT'),
          /PROPERTY_OWNER_EARNING_SERVICE_COVERAGE_RECONCILIATION_MISMATCH/,
        );
      } finally {
        await capClient.query('ROLLBACK').catch(() => undefined);
        capClient.release();
      }

      await replayPool.query(`
        INSERT INTO property_owner_settlements (id, property_id, owner_profile_id, period_start, period_end, gross_amount, owner_amount, operator_fee_amount) VALUES
          ('ffffffff-ffff-4fff-8fff-ffffffffffff', '${propertyId}', '${ownerAId}', '2026-08-01', '2026-08-31', 1400, 1120, 280);
        INSERT INTO property_owner_settlement_lines (settlement_id, earning_id) VALUES
          ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
        INSERT INTO property_owner_earning_adjustments (id, property_id, owner_profile_id, settlement_id, earning_id, effective_month, adjustment_kind, gross_amount_delta, owner_amount_delta, operator_fee_amount_delta, reason) VALUES
          ('12121212-1212-4212-8212-121212121212', '${propertyId}', '${ownerAId}', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '2026-08-01', 'transfer_proration', -100, -80, -20, 'Transfer proration reconciliation');
        UPDATE property_owner_settlements SET settlement_status = 'ready_for_review' WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        UPDATE property_owner_settlements SET settlement_status = 'approved', approved_by_user_id = '${ownerAUserId}' WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        INSERT INTO property_owner_payout_destination_snapshots (id, property_id, owner_profile_id, destination_kind, destination_ciphertext, destination_mask) VALUES
          ('13131313-1313-4313-8313-131313131313', '${propertyId}', '${ownerAId}', 'bank_account', decode('deadbeef', 'hex'), 'Bank ****1234');
        INSERT INTO property_owner_payouts (id, property_id, owner_profile_id, settlement_id, payout_amount, payout_method, payout_reference, payout_destination_snapshot_id, recorded_at) VALUES
          ('14141414-1414-4414-8414-141414141414', '${propertyId}', '${ownerAId}', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 1120, 'bank_transfer', 'TRX-A-001', '13131313-1313-4313-8313-131313131313', '2026-08-20T00:00:00Z');
        UPDATE property_owner_settlements SET settlement_status = 'paid', paid_at = '2026-08-20T00:00:00Z' WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
        INSERT INTO complaints (id, property_id, room_id, complaint_code, complaint_status, priority, created_at) VALUES
          ('15151515-1515-4515-8515-151515151515', '${propertyId}', '${roomId}', 'CMP-A', 'resolved', 'low', '2026-08-15T16:59:59Z'),
          ('16161616-1616-4616-8616-161616161616', '${propertyId}', '${roomId}', 'CMP-B', 'submitted', 'high', '2026-08-15T17:00:00Z');
        SET session_replication_role = replica;
        INSERT INTO property_owner_settlements (id, property_id, owner_profile_id, period_start, period_end, gross_amount, owner_amount, operator_fee_amount) VALUES
          ('17171717-1717-4717-8717-171717171717', '${propertyId}', '${ownerAId}', '2026-08-01', '2026-08-30', 1600, 1280, 320);
        INSERT INTO property_owner_settlement_lines (settlement_id, earning_id) VALUES
          ('17171717-1717-4717-8717-171717171717', '32323232-3232-4232-8232-323232323232'),
          ('17171717-1717-4717-8717-171717171717', '33333333-3333-4333-8333-333333333333');
        SET session_replication_role = origin;
        INSERT INTO notifications (id, property_id, recipient_user_id, notification_type, notification_status, priority, title, source_event_type, source_resource_id, created_at) VALUES
          ('18181818-1818-4818-8818-181818181818', '${propertyId}', '${ownerAUserId}', 'property_owner.settlement.ready', 'unread', 'normal', 'Settlement A', 'property_owner.settlement.ready', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '2026-08-15T16:00:00Z'),
          ('19191919-1919-4919-8919-191919191919', '${propertyId}', '${ownerAUserId}', 'property_owner.settlement.ready', 'unread', 'normal', 'Mixed settlement', 'property_owner.settlement.ready', '17171717-1717-4717-8717-171717171717', '2026-08-15T16:00:00Z');
      `);
      const service = new PropertyOwnerPortalService({ client: replayPool } as never);
      const [ownerA, ownerB] = await Promise.all([
        service.preview(actor(ownerAUserId), '2026-08'),
        service.preview(actor(ownerBUserId), '2026-08'),
      ]);
      assert.deepEqual(
        ownerA.earnings.map((row) => row.earning_id),
        [
          '32323232-3232-4232-8232-323232323232',
          '60606060-6060-4060-8060-606060606060',
          '68686868-6868-4868-8868-686868686868',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        ],
      );
      assert.deepEqual(
        ownerB.earnings.map((row) => row.earning_id),
        [
          '33333333-3333-4333-8333-333333333333',
          '69696969-6969-4969-8969-696969696969',
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        ],
      );
      assert.deepEqual(
        ownerA.complaints.map((row) => row.complaint_id),
        ['15151515-1515-4515-8515-151515151515'],
      );
      assert.deepEqual(
        ownerB.complaints.map((row) => row.complaint_id),
        ['16161616-1616-4616-8616-161616161616'],
      );
      assert.equal(ownerA.summary.gross_earned_rent, '7200');
      assert.equal(ownerB.summary.gross_earned_rent, '5200');
      assert.equal(ownerA.summary.owner_adjustments, '-80');
      assert.equal(ownerA.summary.paid_out, '1120');
      assert.deepEqual(
        ownerA.notifications.map((row) => row.notification_id),
        ['18181818-1818-4818-8818-181818181818'],
      );
      const ownerATransferOccupancy = ownerA.occupancies.find(
        (row) => row.room_code === 'AK-01-01',
      );
      const ownerBTransferLease = ownerB.leases.find((row) => row.room_code === 'AK-01-01');
      assert.deepEqual(ownerATransferOccupancy, {
        occupancy_id: '99999999-9999-4999-8999-999999999999',
        room_code: 'AK-01-01',
        start_date: '2026-08-01',
        end_date: '2026-08-15',
        occupancy_status: 'ended',
      });
      assert.deepEqual(ownerBTransferLease, {
        lease_id: leaseId,
        room_code: 'AK-01-01',
        start_date: '2026-08-16',
        end_date: '2026-08-31',
        lease_status: 'ended',
      });
      const paymentTotal = await replayPool.query<{ gross: string }>(
        `SELECT SUM(gross_collected_amount)::text AS gross FROM property_owner_earnings WHERE payment_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'`,
      );
      assert.equal(paymentTotal.rows[0]?.gross, '3100');
      const allocationTotals = await replayPool.query<{ allocation_id: string; gross: string }>(
        `SELECT payment_allocation_id::text AS allocation_id, SUM(gross_collected_amount)::text AS gross
         FROM property_owner_earnings
         WHERE payment_allocation_id IN ('53535353-5353-4353-8353-535353535353', '54545454-5454-4454-8454-545454545454')
         GROUP BY payment_allocation_id ORDER BY payment_allocation_id`,
      );
      assert.deepEqual(allocationTotals.rows, [
        { allocation_id: '53535353-5353-4353-8353-535353535353', gross: '2200' },
        { allocation_id: '54545454-5454-4454-8454-545454545454', gross: '2000' },
      ]);
      const sameInvoicePartialPayments = await replayPool.query<{
        allocation_id: string;
        gross: string;
      }>(
        `SELECT payment_allocation_id::text AS allocation_id, SUM(gross_collected_amount)::text AS gross
         FROM property_owner_earnings
         WHERE payment_allocation_id IN ('50505050-5050-4050-8050-505050505050', '67676767-6767-4767-8767-676767676767')
         GROUP BY payment_allocation_id ORDER BY payment_allocation_id`,
      );
      assert.deepEqual(sameInvoicePartialPayments.rows, [
        { allocation_id: '50505050-5050-4050-8050-505050505050', gross: '3100' },
        { allocation_id: '67676767-6767-4767-8767-676767676767', gross: '900' },
      ]);
      await assert.rejects(
        service.preview(actor(ownerAUserId), '2026-07'),
        (error) => ownerReportErrorCode(error) === 'OWNER_REPORT_PERIOD_DENIED',
      );
      await replayPool.end();
      replayPool = undefined;
      await stop(replayDirectory, replayPort);
      replayPort = null;

      init(rollbackDirectory);
      rollbackPort = portFor();
      await start(rollbackDirectory, rollbackPort);
      rollbackPool = new Pool({
        host: '127.0.0.1',
        port: rollbackPort,
        user: 'postgres',
        database: 'postgres',
      });
      await rollbackPool.query(`${prelude}\n${migration035}\n${migration036}`);
      const failed = migration037.replace(
        /COMMIT;\s*$/,
        () => "DO $$ BEGIN RAISE EXCEPTION 'W10_OWNER_A3_SYNTHETIC_ROLLBACK'; END $$; COMMIT;",
      );
      await assert.rejects(rollbackPool.query(failed), /W10_OWNER_A3_SYNTHETIC_ROLLBACK/);
      const rollback = await rollbackPool.query<{ present: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'property_owner_earnings' AND column_name = 'service_from') AS present`,
      );
      assert.equal(rollback.rows[0]?.present, false);
    } finally {
      await replayPool?.end();
      await rollbackPool?.end();
      if (replayPort !== null) await stop(replayDirectory, replayPort);
      if (rollbackPort !== null) await stop(rollbackDirectory, rollbackPort);
      for (const directory of createdDirectories)
        rmSync(directory, { recursive: true, force: true });
      for (const directory of createdDirectories) assert.equal(existsSync(directory), false);
    }
  },
);
