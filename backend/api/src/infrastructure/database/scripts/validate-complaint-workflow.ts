import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
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

type ComplaintCategoryResponse = {
  id: string;
  normalizedCode: string;
};

type ComplaintResponse = {
  id: string;
  complaintStatus: string;
  roomId: string | null;
  locationNote: string | null;
};

type WorkOrderResponse = {
  id: string;
  workOrderStatus: string;
  assignedToUserId: string | null;
};

type SummaryResponse = {
  totalCount: number;
  openCount: number;
};

const baseUrl = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/${process.env.API_PREFIX ?? 'api/v1'}`;
const runSuffix = `${Date.now()}`;

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
      'x-correlation-id': `complaint-workflow-validation-${runSuffix}`,
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

async function requestDenied(method: string, path: string, token: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-correlation-id': `complaint-workflow-validation-${runSuffix}`,
    },
  });

  if (response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} should be denied, got ${response.status}: ${text}`);
  }
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
     VALUES ($1, $2, 'complaint-workflow-validation', 'complaint-workflow-validation', now() + interval '30 minutes')`,
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

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();

  const adminToken = await validationToken(client, 'dev.admin@kostation.test');
  const residentAlphaToken = await validationToken(client, 'dev.resident.alpha@kostation.test');
  const residentBravoToken = await validationToken(client, 'dev.resident.bravo@kostation.test');
  const technicianToken = await validationToken(client, 'dev.technician.budi@kostation.test');
  const propertyOwnerToken = await validationToken(client, 'dev.property.owner@kostation.test');

  const categories = await request<ComplaintCategoryResponse[]>(
    'GET',
    `/complaint-categories?property_id=${CORE_SEED_IDS.granadaProperty}`,
    adminToken,
  );
  assert(categories.length === 10, `complaint categories count expected 10, got ${categories.length}`);

  const acCategory = categories.find((category) => category.normalizedCode === 'ac');
  const commonFacilityCategory = categories.find((category) => category.normalizedCode === 'common_facility');
  assert(acCategory, 'ac complaint category not found');
  assert(commonFacilityCategory, 'common_facility complaint category not found');

  const ownComplaint = await request<ComplaintResponse>('POST', '/my/complaints', residentAlphaToken, {
    category_id: acCategory.id,
    title: `Validation AC complaint ${runSuffix}`,
    description: 'Development validation complaint created by resident alpha.',
  }, 201);
  assert(ownComplaint.id, 'resident complaint create did not return id');

  const ownList = await request<ComplaintResponse[]>('GET', '/my/complaints?limit=50&offset=0', residentAlphaToken);
  assert(
    ownList.some((complaint) => complaint.id === ownComplaint.id),
    'resident cannot see own complaint in list',
  );

  const ownDetail = await request<ComplaintResponse>('GET', `/my/complaints/${ownComplaint.id}`, residentAlphaToken);
  assert(ownDetail.id === ownComplaint.id, 'resident cannot read own complaint detail');

  await requestDenied('GET', `/my/complaints/${ownComplaint.id}`, residentBravoToken);

  const acknowledged = await request<ComplaintResponse>('POST', `/complaints/${ownComplaint.id}/acknowledge`, adminToken, undefined, 201);
  assert(acknowledged.complaintStatus === 'acknowledged', 'admin acknowledge did not set acknowledged status');

  const assignedComplaint = await request<ComplaintResponse>(
    'POST',
    `/complaints/${ownComplaint.id}/assign`,
    adminToken,
    { assigned_to_user_id: CORE_SEED_IDS.devUsers.technicians.budi },
    201,
  );
  assert(assignedComplaint.complaintStatus === 'in_progress', 'admin assign did not move complaint to in_progress');

  const workOrder = await request<WorkOrderResponse>('POST', '/work-orders', adminToken, {
    property_id: CORE_SEED_IDS.granadaProperty,
    complaint_id: ownComplaint.id,
    work_order_code: `WO-VAL-${runSuffix}`,
    title: `Validation work order ${runSuffix}`,
    description: 'Development validation work order.',
    priority: 'high',
  }, 201);
  assert(workOrder.workOrderStatus === 'open', 'work order create did not start as open');

  const assignedWorkOrder = await request<WorkOrderResponse>(
    'POST',
    `/work-orders/${workOrder.id}/assign`,
    adminToken,
    { assigned_to_user_id: CORE_SEED_IDS.devUsers.technicians.budi },
    201,
  );
  assert(assignedWorkOrder.assignedToUserId === CORE_SEED_IDS.devUsers.technicians.budi, 'work order was not assigned to technician');

  const technicianWorkOrders = await request<WorkOrderResponse[]>('GET', '/my/work-orders?limit=50&offset=0', technicianToken);
  assert(
    technicianWorkOrders.every((item) => item.assignedToUserId === CORE_SEED_IDS.devUsers.technicians.budi),
    'technician received unassigned work order in my/work-orders',
  );
  assert(
    technicianWorkOrders.some((item) => item.id === workOrder.id),
    'technician cannot see assigned work order',
  );

  const startedWorkOrder = await request<WorkOrderResponse>(
    'POST',
    `/my/work-orders/${workOrder.id}/start`,
    technicianToken,
    undefined,
    201,
  );
  assert(startedWorkOrder.workOrderStatus === 'in_progress', 'technician start did not set in_progress');

  const completedWorkOrder = await request<WorkOrderResponse>(
    'POST',
    `/my/work-orders/${workOrder.id}/complete`,
    technicianToken,
    undefined,
    201,
  );
  assert(completedWorkOrder.workOrderStatus === 'completed', 'technician complete did not set completed');

  const verifiedWorkOrder = await request<WorkOrderResponse>('POST', `/work-orders/${workOrder.id}/verify`, adminToken, undefined, 201);
  assert(verifiedWorkOrder.workOrderStatus === 'verified', 'admin verify did not set verified');

  const commonAreaComplaint = await request<ComplaintResponse>('POST', '/my/complaints', residentAlphaToken, {
    category_id: commonFacilityCategory.id,
    title: `Validation common area ${runSuffix}`,
    description: 'Development validation common area complaint.',
    location_note: 'Validation common area lobby',
  }, 201);
  assert(commonAreaComplaint.roomId === null, 'common area complaint should have room_id null');
  assert(commonAreaComplaint.locationNote, 'common area complaint should have location_note');

  const summary = await request<SummaryResponse>(
    'GET',
    `/property-owner/complaints/summary?property_id=${CORE_SEED_IDS.granadaProperty}`,
    propertyOwnerToken,
  );
  assert(summary.totalCount >= 1, 'property owner summary totalCount should include complaints');
  assert(summary.openCount >= 1, 'property owner summary openCount should include open complaints');

  console.log('Complaint workflow validation passed.');
  console.log(`complaint_categories: ${categories.length}`);
  console.log(`created_complaint_id: ${ownComplaint.id}`);
  console.log(`created_work_order_id: ${workOrder.id}`);
  console.log(`common_area_complaint_id: ${commonAreaComplaint.id}`);

  client.release();
  await pool.end();
}

void main();
