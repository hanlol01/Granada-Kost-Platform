import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import type { UserAccessContext } from '../../src/modules/iam/types/iam.types';
import { PropertyOwnerPortalController } from '../../src/modules/property-owner-management/property-owner-portal.controller';
import { PropertyOwnerPortalService } from '../../src/modules/property-owner-management/property-owner-portal.service';
import { PERMISSIONS_KEY } from '../../src/modules/rbac/decorators/permissions.decorator';
import { ROLES_KEY } from '../../src/modules/rbac/decorators/roles.decorator';

const actorId = '22222222-2222-4222-8222-222222222222';
const propertyId = '11111111-1111-4111-8111-111111111111';
const ownerId = '33333333-3333-4333-8333-333333333333';
const actor = (id = actorId): UserAccessContext => ({
  id,
  email: 'owner@test',
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
  sessionId: 'session',
});

const assignment = (from = '2026-08-01', until: string | null = null) => ({
  assignment_key: 'room:assignment-1',
  effective_from: from,
  effective_until: until,
  scope_from: from,
  scope_until: until ?? '2026-09-01',
});

const reportRow = () => ({
  asset_count: 1,
  occupied_count: 1,
  active_lease_count: 1,
  gross_earned_rent: '2214000000',
  owner_entitlement: '2000000000',
  management_fee: '214000000',
  owner_adjustments: '-1000',
  paid_out: '1999999000',
  scope: [
    {
      room_id: 'room-1',
      room_code: 'RK-01-01',
      scope_from: '2026-08-01',
      scope_until: '2026-09-01',
    },
  ],
  occupancies: [
    {
      occupancy_id: 'occupancy-ended',
      room_code: 'RK-01-01',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      occupancy_status: 'ended',
    },
  ],
  leases: [
    {
      lease_id: 'lease-ended',
      room_code: 'RK-01-01',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      lease_status: 'ended',
    },
  ],
  earnings: [
    {
      earning_id: 'earning-1',
      room_code: 'RK-01-01',
      earning_month: '2026-08-01',
      service_from: '2026-08-01',
      service_until: '2026-09-01',
      earning_status: 'recognized',
      gross_earned_rent: '2214000000',
      owner_entitlement: '2000000000',
      management_fee: '214000000',
    },
  ],
  adjustments: [
    {
      adjustment_id: 'adjustment-1',
      earning_id: 'earning-1',
      settlement_id: 'settlement-1',
      effective_month: '2026-08-01',
      adjustment_kind: 'transfer_proration',
      gross_amount_delta: '-1000',
      owner_amount_delta: '-1000',
      operator_fee_amount_delta: '0',
    },
  ],
  settlements: [
    {
      settlement_id: 'settlement-1',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      settlement_status: 'paid',
      gross_amount: '2213999000',
      owner_amount: '1999999000',
      operator_fee_amount: '214000000',
    },
  ],
  payouts: [
    {
      payout_id: 'payout-1',
      settlement_id: 'settlement-1',
      recorded_at: '2026-08-31T03:00:00.000Z',
      payout_kind: 'payout',
      payout_amount: '1999999000',
    },
  ],
  complaints: [
    {
      complaint_id: 'complaint-1',
      complaint_code: 'CMP-001',
      complaint_status: 'resolved',
      priority: 'high',
      created_at: '2026-08-05T03:00:00.000Z',
    },
  ],
  maintenance: [
    {
      work_order_id: 'work-order-1',
      work_order_code: 'WO-001',
      work_order_status: 'verified',
      priority: 'medium',
      created_at: '2026-08-06T03:00:00.000Z',
    },
  ],
  notifications: [
    {
      notification_id: 'notification-1',
      notification_type: 'complaint.created',
      notification_status: 'read',
      priority: 'normal',
      title: 'Laporan biaya café – Жанна',
      source_event_type: 'complaint.created',
      source_resource_id: 'complaint-1',
      created_at: '2026-08-05T03:01:00.000Z',
    },
  ],
});

function serviceFor(row = reportRow(), owner = ownerId, assignmentRow = assignment()) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const service = new PropertyOwnerPortalService({
    client: {
      query: (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('property_owner_profiles'))
          return {
            rows: [{ id: owner, property_id: propertyId, full_name: 'Pemilik Café Жанна' }],
          };
        if (sql.includes('assignment_key')) return { rows: [assignmentRow] };
        if (sql.includes('authorized_earnings')) return { rows: [structuredClone(row)] };
        throw new Error(`unexpected query: ${sql}`);
      },
    },
  } as never);
  return { service, calls };
}

function zipEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const size = buffer.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entries.set(name, buffer.subarray(dataStart, dataStart + size).toString('utf8'));
    offset = dataStart + size;
  }
  return entries;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''));
  }
  return pages.join('\n');
}

void test('portal has exact property_owner read authority and GET-only handlers', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PropertyOwnerPortalController), [
    'property_owner',
  ]);
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, PropertyOwnerPortalController),
    actor().permissions,
  );
  for (const name of ['create', 'update', 'delete', 'approve', 'pay'])
    assert.equal(
      (PropertyOwnerPortalController.prototype as unknown as Record<string, unknown>)[name],
      undefined,
    );
});

void test('missing profile is zero-safe and does not query operational scope', async () => {
  let calls = 0;
  const service = new PropertyOwnerPortalService({
    client: {
      query: () => {
        calls += 1;
        return { rows: [] };
      },
    },
  } as never);
  const result = await service.getPortal(actor());
  assert.equal(calls, 1);
  assert.equal(result.owner, null);
  assert.equal(result.scope.state, 'empty');
});

void test('duplicate profiles fail before asset, finance, or report query', async () => {
  let calls = 0;
  const service = new PropertyOwnerPortalService({
    client: {
      query: () => {
        calls += 1;
        return { rows: [{ id: ownerId }, { id: 'owner-2' }] };
      },
    },
  } as never);
  await assert.rejects(service.getPortal(actor()), (error) => {
    assert.ok(error instanceof HttpException);
    assert.equal(
      (error.getResponse() as { code?: string }).code,
      'PROPERTY_OWNER_PROFILE_AMBIGUOUS',
    );
    return true;
  });
  assert.equal(calls, 1);
});

void test('current portal complaints, maintenance, notifications, and leases retain assignment intervals', async () => {
  const calls: string[] = [];
  const service = new PropertyOwnerPortalService({
    client: {
      query: (sql: string) => {
        calls.push(sql.replace(/\s+/g, ' '));
        if (sql.includes('property_owner_profiles'))
          return { rows: [{ id: ownerId, property_id: propertyId, full_name: 'Owner' }] };
        if (sql.includes('assignment_state'))
          return {
            rows: [
              {
                building_count: 1,
                room_count: 1,
                occupied_count: 1,
                reserved_count: 0,
                maintenance_count: 0,
                vacant_count: 0,
                open_complaints: 1,
                open_maintenance: 1,
                unread_notifications: 1,
                scheduled_count: 0,
                next_scheduled_date: null,
                expired_count: 0,
                latest_historical_period: null,
              },
            ],
          };
        if (sql.includes('lease_end_date'))
          return {
            rows: [
              {
                room_code: 'RK-01-01',
                room_status: 'occupied',
                building_code: 'RK-01',
                building_name: 'Rumah Kost',
                lease_status: 'active',
                lease_end_date: '2026-12-31',
              },
            ],
          };
        throw new Error(`unexpected query: ${sql}`);
      },
    },
  } as never);
  const portal = await service.getPortal(actor());
  assert.equal(portal.issues.unread_notifications, 1);
  const summarySql = calls[1];
  assert.match(summarySql, /complaints\.created_at >= authorized_scope\.scope_from/);
  assert.match(summarySql, /complaints\.created_at < authorized_scope\.scope_until/);
  assert.match(summarySql, /work_orders\.created_at >= authorized_scope\.scope_from/);
  assert.match(summarySql, /work_orders\.created_at < authorized_scope\.scope_until/);
  assert.match(
    summarySql,
    /notification_resources resources ON resources\.notification_id = notifications\.id/,
  );
  assert.match(summarySql, /notifications\.created_at >= authorized_scope\.scope_from/);
  assert.match(summarySql, /notifications\.created_at < authorized_scope\.scope_until/);
  assert.match(calls[2], /leases\.start_date < COALESCE\(scope\.scope_until/);
  assert.match(calls[2], /COALESCE\(leases\.end_date \+ 1, 'infinity'::date\) > scope\.scope_from/);
});

void test('historical lifecycle projections expose only clipped half-open owner-report service intervals', async () => {
  const { service, calls } = serviceFor();
  const report = await service.preview(actor(), '2026-08');
  assert.equal(report.scope[0]?.scope_from, '2026-08-01');
  assert.equal(report.occupancies[0]?.start_date, '2026-08-01');
  assert.equal(report.occupancies[0]?.end_date, '2026-08-31');
  assert.equal(report.leases[0]?.start_date, '2026-08-01');
  assert.equal(report.leases[0]?.end_date, '2026-08-31');
  assert.equal(report.leases[0]?.lease_id, 'lease-ended');
  assert.equal(report.occupancies[0]?.occupancy_id, 'occupancy-ended');
  const sql = calls[2].sql.replace(/\s+/g, ' ');
  assert.match(sql, /SELECT DISTINCT room_id, scope_from, scope_until FROM raw_period_scope/);
  assert.match(sql, /authorized_lifecycle AS/);
  assert.match(
    sql,
    /GREATEST\(leases\.start_date, occupancies\.start_date, scope\.scope_from\) AS service_from/,
  );
  assert.match(
    sql,
    /LEAST\(COALESCE\(leases\.end_date \+ 1, 'infinity'::date\), COALESCE\(occupancies\.end_date \+ 1, 'infinity'::date\), scope\.scope_until\) AS service_until/,
  );
  assert.match(
    sql,
    /SELECT occupancy_id AS id, room_id, service_from AS start_date, \(service_until - 1\) AS end_date/,
  );
  assert.match(
    sql,
    /SELECT lease_id AS id, room_id, service_from AS start_date, \(service_until - 1\) AS end_date/,
  );
  assert.match(sql, /complaints\.created_at >= scope\.scope_from/);
  assert.match(sql, /complaints\.created_at < scope\.scope_until/);
  assert.match(sql, /work_orders\.created_at >= scope\.scope_from/);
  assert.match(sql, /work_orders\.created_at < scope\.scope_until/);
  assert.match(sql, /occupancies\.occupancy_status IN \('active', 'ended', 'transferred'\)/);
  assert.match(sql, /leases\.lease_status IN \('active', 'ended', 'completed', 'transferred'\)/);
  assert.doesNotMatch(sql, /occupancies\.occupancy_status = 'active'/);
  assert.doesNotMatch(sql, /leases\.lease_status = 'active'/);
  assert.match(
    sql,
    /notification_resources resources ON resources\.notification_id = notifications\.id/,
  );
  assert.match(sql, /notifications\.property_id = \$2 AND notifications\.recipient_user_id = \$5/);
  assert.match(sql, /notifications\.created_at >= scope\.scope_from/);
  assert.match(sql, /notifications\.created_at < scope\.scope_until/);
});

void test('two owners sharing a room receive only events inside their exact mid-month intervals', async () => {
  const ownerA = serviceFor(
    {
      ...reportRow(),
      scope: [
        {
          room_id: 'room-1',
          room_code: 'RK-01-01',
          scope_from: '2026-08-01',
          scope_until: '2026-08-16',
        },
      ],
      complaints: [
        {
          complaint_id: 'complaint-a',
          complaint_code: 'CMP-A',
          complaint_status: 'resolved',
          priority: 'low',
          created_at: '2026-08-15T16:59:59.000Z',
        },
      ],
      maintenance: [],
      notifications: [],
    },
    'owner-a',
    assignment('2026-08-01', '2026-08-16'),
  ).service;
  const ownerB = serviceFor(
    {
      ...reportRow(),
      scope: [
        {
          room_id: 'room-1',
          room_code: 'RK-01-01',
          scope_from: '2026-08-16',
          scope_until: '2026-09-01',
        },
      ],
      complaints: [
        {
          complaint_id: 'complaint-b',
          complaint_code: 'CMP-B',
          complaint_status: 'submitted',
          priority: 'high',
          created_at: '2026-08-15T17:00:00.000Z',
        },
      ],
      maintenance: [],
      notifications: [],
    },
    'owner-b',
    assignment('2026-08-16', null),
  ).service;
  const [a, b] = await Promise.all([
    ownerA.preview(actor('actor-a'), '2026-08'),
    ownerB.preview(actor('actor-b'), '2026-08'),
  ]);
  assert.deepEqual(
    a.complaints.map((row) => row.complaint_id),
    ['complaint-a'],
  );
  assert.deepEqual(
    b.complaints.map((row) => row.complaint_id),
    ['complaint-b'],
  );
  assert.equal(a.scope[0]?.scope_until, b.scope[0]?.scope_from);
});

void test('former and new owners receive only their clipped lifecycle dates', async () => {
  const formerRow = reportRow();
  formerRow.scope[0].scope_until = '2026-08-16';
  formerRow.occupancies[0].end_date = '2026-08-15';
  formerRow.leases[0].end_date = '2026-08-15';
  const newRow = reportRow();
  newRow.scope[0].scope_from = '2026-08-16';
  newRow.occupancies[0].start_date = '2026-08-16';
  newRow.leases[0].start_date = '2026-08-16';
  const [former, next] = await Promise.all([
    serviceFor(formerRow, 'owner-former', assignment('2026-08-01', '2026-08-16')).service.preview(
      actor('actor-former'),
      '2026-08',
    ),
    serviceFor(newRow, 'owner-next', assignment('2026-08-16', null)).service.preview(
      actor('actor-next'),
      '2026-08',
    ),
  ]);
  assert.equal(former.occupancies[0]?.start_date, '2026-08-01');
  assert.equal(former.occupancies[0]?.end_date, '2026-08-15');
  assert.equal(next.leases[0]?.start_date, '2026-08-16');
  assert.equal(next.leases[0]?.end_date, '2026-08-31');
});

void test('same-recipient notification requires authorized property and source asset lineage', async () => {
  const { service, calls } = serviceFor();
  const report = await service.preview(actor(), '2026-08');
  assert.deepEqual(
    report.notifications.map((row) => row.notification_id),
    ['notification-1'],
  );
  const sql = calls[2].sql;
  assert.match(sql, /JOIN complaints ON complaints\.id = notifications\.source_resource_id/);
  assert.match(sql, /complaints\.property_id = notifications\.property_id/);
  assert.match(sql, /JOIN period_scope scope ON scope\.room_id = resources\.room_id/);
  assert.doesNotMatch(sql, /FROM notifications WHERE recipient_user_id/);
});

void test('malformed counts and money fail closed instead of becoming zero', async () => {
  for (const [field, value] of [
    ['asset_count', null],
    ['occupied_count', -1],
    ['active_lease_count', Number.MAX_SAFE_INTEGER + 1],
    ['owner_entitlement', null],
    ['gross_earned_rent', {}],
    ['paid_out', '1.5'],
  ] as const) {
    const row = reportRow() as Record<string, unknown>;
    row[field] = value;
    const { service } = serviceFor(row as ReturnType<typeof reportRow>);
    await assert.rejects(service.preview(actor(), '2026-08'), (error) => {
      assert.ok(error instanceof HttpException);
      assert.equal((error.getResponse() as { code?: string }).code, 'OWNER_REPORT_DATA_INVALID');
      return true;
    });
  }
  for (const mutate of [
    (row: ReturnType<typeof reportRow>) => {
      row.earnings[0].owner_entitlement = '-1';
    },
    (row: ReturnType<typeof reportRow>) => {
      row.settlements[0].owner_amount = null as never;
    },
    (row: ReturnType<typeof reportRow>) => {
      row.payouts[0].payout_amount = {} as never;
    },
    (row: ReturnType<typeof reportRow>) => {
      row.adjustments[0].gross_amount_delta = '01';
    },
  ]) {
    const row = reportRow();
    mutate(row);
    const { service } = serviceFor(row);
    await assert.rejects(service.preview(actor(), '2026-08'), (error) => {
      assert.ok(error instanceof HttpException);
      assert.equal((error.getResponse() as { code?: string }).code, 'OWNER_REPORT_DATA_INVALID');
      return true;
    });
  }
});

void test('preview, embedded-Unicode PDF extraction, and parsed XLSX preserve detail identities and totals', async () => {
  const { service } = serviceFor();
  const preview = await service.preview(actor(), '2026-08');
  const pdf = await service.export(actor(), '2026-08', 'pdf');
  const xlsx = await service.export(actor(), '2026-08', 'xlsx');
  const pdfText = await extractPdfText(pdf.content);
  for (const sentinel of [
    '[SECTION:SCOPE]',
    'room-1',
    '[SECTION:OCCUPANCIES]',
    'occupancy-ended',
    '[SECTION:LEASES]',
    'lease-ended',
    '[SECTION:EARNINGS]',
    'earning-1',
    '[SECTION:ADJUSTMENTS]',
    'adjustment-1',
    '[SECTION:SETTLEMENTS]',
    'settlement-1',
    '[SECTION:PAYOUTS]',
    'payout-1',
    '[SECTION:COMPLAINTS]',
    'complaint-1',
    '[SECTION:MAINTENANCE]',
    'work-order-1',
    '[SECTION:NOTIFICATIONS]',
    preview.summary.owner_entitlement,
  ])
    assert.match(pdfText, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const entries = zipEntries(xlsx.content);
  const workbook = entries.get('xl/workbook.xml') ?? '';
  for (const sheet of [
    'Summary',
    'Scope',
    'Occupancies',
    'Leases',
    'Earnings',
    'Adjustments',
    'Settlements',
    'Payouts',
    'Complaints',
    'Maintenance',
    'Notifications',
  ])
    assert.match(workbook, new RegExp(`name="${sheet}"`));
  const allSheets = [...entries.entries()]
    .filter(([name]) => name.startsWith('xl/worksheets/'))
    .map(([, xml]) => xml)
    .join('\n');
  for (const identity of [
    'room-1',
    'occupancy-ended',
    'lease-ended',
    'earning-1',
    'adjustment-1',
    'settlement-1',
    'payout-1',
    'complaint-1',
    'work-order-1',
    'notification-1',
  ])
    assert.match(allSheets, new RegExp(`>${identity}<`));
  for (const total of Object.values(preview.summary))
    assert.match(allSheets, new RegExp(`>${String(total)}<`));
  for (const sentinel of ['Laporan biaya café – Жанна', 'Pemilik Café Жанна']) {
    assert.match(pdfText, new RegExp(sentinel));
    assert.match(allSheets, new RegExp(sentinel));
  }
  assert.match(pdf.content.toString('latin1'), /\/Subtype \/Type0/);
  assert.match(pdf.content.toString('latin1'), /\/ToUnicode/);
});

void test('out-of-period report is denied and finance is constrained by service coverage', async () => {
  const denied = new PropertyOwnerPortalService({
    client: {
      query: (sql: string) =>
        sql.includes('property_owner_profiles')
          ? { rows: [{ id: ownerId, property_id: propertyId, full_name: 'Owner' }] }
          : { rows: [] },
    },
  } as never);
  await assert.rejects(
    denied.preview(actor(), '2025-01'),
    (error) =>
      error instanceof HttpException &&
      (error.getResponse() as { code?: string }).code === 'OWNER_REPORT_PERIOD_DENIED',
  );
  const { service, calls } = serviceFor();
  await service.preview(actor(), '2026-08');
  assert.match(
    calls[2].sql,
    /scope\.scope_from <= earnings\.service_from AND earnings\.service_until <= scope\.scope_until/,
  );
  assert.match(calls[2].sql, /assignments\.effective_from <= earnings\.service_from/);
  assert.match(
    calls[2].sql,
    /JOIN authorized_settlements settlements ON settlements\.id = notifications\.source_resource_id/,
  );
  assert.match(calls[2].sql, /authorized_payout_resources AS/);
  assert.match(
    calls[2].sql,
    /JOIN authorized_payout_resources payouts ON payouts\.id = notifications\.source_resource_id/,
  );
});
