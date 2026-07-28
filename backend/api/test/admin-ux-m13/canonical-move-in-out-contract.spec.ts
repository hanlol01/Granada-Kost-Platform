import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import 'reflect-metadata';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsOptional, validateSync } from 'class-validator';
import { AdminUxRoomV2Controller } from '../../src/modules/admin-ux-master/admin-ux-room-v2.controller';
import { ListRoomsV2QueryDto } from '../../src/modules/admin-ux-master/admin-ux-room-v2.dto';
import { AdminUxRoomV2Service } from '../../src/modules/admin-ux-master/admin-ux-room-v2.service';
import { LeaseFeatureService } from '../../src/modules/lease/lease-feature.service';
import { LeaseService } from '../../src/modules/lease/lease.service';
import { OccupancyService } from '../../src/modules/occupancy/occupancy.service';
import { OccupancyRepository } from '../../src/modules/occupancy/repositories/occupancy.repository';

const root = resolve(__dirname, '../..');
const propertyId = '20000000-0000-4000-8000-000000000001';
const roomId = '30000000-0000-4000-8000-000000000001';
const residentId = '40000000-0000-4000-8000-000000000001';
const occupancyId = '50000000-0000-4000-8000-000000000001';
const checkOutId = '60000000-0000-4000-8000-000000000001';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  roles: ['manager'],
  permissions: ['lease.manage', 'checkout.manage'],
  propertyIds: [propertyId],
};
const context = { correlationId: 'safe-correlation' };
const occupancy = {
  id: occupancyId,
  propertyId,
  roomId,
  residentId,
  startDate: '2026-07-28',
  endDate: null,
  occupancyStatus: 'active' as const,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
};
const checkOut = {
  id: checkOutId,
  propertyId,
  occupancyId,
  roomId,
  residentId,
  requestedCheckOutDate: '2026-07-28',
  reason: null,
  checkOutStatus: 'requested' as const,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  finalizedAt: null,
};

function response(error: unknown): unknown {
  return (error as { getResponse(): unknown }).getResponse();
}

function assertPairedRoomPropertyScope(source: string): void {
  assert.match(
    source,
    /FROM UNNEST\(\$1::uuid\[\], \$2::uuid\[\]\) AS scoped\(room_id, property_id\)/,
  );
  assert.match(
    source,
    /occupancy\.room_id = scoped\.room_id[\s\S]*occupancy\.property_id = scoped\.property_id/,
  );
  assert.doesNotMatch(
    source,
    /occupancy\.room_id = ANY\(\$1::uuid\[\]\)[\s\S]*occupancy\.property_id = ANY\(\$2::uuid\[\]\)/,
  );
}

function methodRegion(source: string, methodName: string): string {
  const start = source.indexOf(`  async ${methodName}(`);
  assert.notEqual(start, -1, `missing ${methodName} method`);
  const next = source.indexOf('\n  async ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function assertFinalizeLocking(source: string): void {
  const finalize = methodRegion(source, 'finalizeCheckOut');
  assert.match(
    finalize,
    /FROM rooms[\s\S]*FOR UPDATE[\s\S]*FROM occupancies occupancy[\s\S]*FOR UPDATE[\s\S]*FROM leases[\s\S]*lease_status = 'active'[\s\S]*FOR SHARE[\s\S]*UPDATE occupancies/,
  );
}

function transformRoomsQuery(value: unknown, present = true) {
  const plain = present ? { include_active_lease: value } : {};
  const dto = plainToInstance(ListRoomsV2QueryDto, plain, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
}

class ImplicitBooleanRegressionDto {
  @IsOptional()
  @IsBoolean()
  include_active_lease?: boolean;
}

// tsx/esbuild does not emit decorator type metadata. The running Nest build
// does, so focused tests install the same metadata before class-transformer runs.
Reflect.defineMetadata(
  'design:type',
  Boolean,
  ListRoomsV2QueryDto.prototype,
  'include_active_lease',
);
Reflect.defineMetadata(
  'design:type',
  Boolean,
  ImplicitBooleanRegressionDto.prototype,
  'include_active_lease',
);

function roomReadRow(): Record<string, unknown> {
  return {
    id: roomId,
    property_id: propertyId,
    kost_type_id: '70000000-0000-4000-8000-000000000001',
    number: 'RK-01-01',
    room_code: 'RK-01-01',
    building_id: '80000000-0000-4000-8000-000000000001',
    building_code: 'RK-01',
    building_name: 'Rumah Kost 01',
    unit_code: '01',
    gender_policy: 'male',
    floor: '1',
    floor_code: 'A',
    floor_label: 'Lantai 1',
    size_label: '3 x 4 m',
    room_status: 'occupied',
    primary_photo_file_id: null,
    public_visible: true,
    created_at: new Date('2026-07-28T00:00:00.000Z'),
    updated_at: new Date('2026-07-28T00:00:00.000Z'),
    kost_type_name: 'Rumah Kost',
    kost_type_slug: 'rukost',
    kost_type_category: 'rukost',
    monthly_price: 1800000,
    yearly_price: 0,
    deposit_amount: 0,
  };
}

test('Rooms query DTO preserves exact booleans under the API implicit conversion settings', () => {
  const omitted = transformRoomsQuery(undefined, false);
  assert.equal(omitted.errors.length, 0);
  assert.equal(omitted.dto.include_active_lease, undefined);

  for (const [raw, expected] of [
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
  ] as const) {
    const result = transformRoomsQuery(raw);
    assert.equal(result.errors.length, 0, `expected ${JSON.stringify(raw)} to validate`);
    assert.equal(result.dto.include_active_lease, expected);
  }

  for (const raw of ['1', '0', '', 'yes', 'arbitrary', {}, []]) {
    const result = transformRoomsQuery(raw);
    assert.ok(result.errors.length > 0, `expected ${JSON.stringify(raw)} to fail validation`);
  }

  const regression = plainToInstance(
    ImplicitBooleanRegressionDto,
    { include_active_lease: 'false' },
    { enableImplicitConversion: true },
  );
  assert.equal(regression.include_active_lease, true);
  assert.equal(transformRoomsQuery('false').dto.include_active_lease, false);
});

test('list and detail explicit false stay boolean-false and skip the anomaly wire', async () => {
  let anomalyQueries = 0;
  const database = {
    client: {
      query: async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
        if (sql.includes('FROM UNNEST')) {
          anomalyQueries += 1;
          return {
            rows: [
              {
                room_id: roomId,
                id: occupancyId,
                resident_id: residentId,
                resident_name: 'Nama Aman',
                start_date: '2026-07-28',
                lease_reconciliation_required: true,
              },
            ],
          };
        }
        if (sql.includes('kost_type_facility_assignments')) return { rows: [] };
        return { rows: [roomReadRow()] };
      },
    },
  };
  const service = new AdminUxRoomV2Service(
    database as never,
    { assertCanReadProperty: async () => undefined } as never,
    {} as never,
  );
  const falseDto = transformRoomsQuery('false').dto;
  const falseResult = (await service.list(user, {
    ...falseDto,
    property_id: propertyId,
  })) as { data: Array<Record<string, unknown>> };
  const falseWire = JSON.parse(JSON.stringify(falseResult)) as {
    data: Array<Record<string, unknown>>;
  };
  assert.equal(anomalyQueries, 0);
  assert.equal('active_occupancy' in falseWire.data[0], false);
  assert.equal('lease_reconciliation_required' in falseWire.data[0], false);

  const trueDto = transformRoomsQuery('true').dto;
  const trueResult = (await service.list(user, {
    ...trueDto,
    property_id: propertyId,
  })) as { data: Array<Record<string, unknown>> };
  assert.equal(anomalyQueries, 1);
  assert.equal(trueResult.data[0].lease_reconciliation_required, true);

  const listFlags: Array<boolean | undefined> = [];
  const detailFlags: boolean[] = [];
  const controller = new AdminUxRoomV2Controller({
    list: async (_user: unknown, query: ListRoomsV2QueryDto) => {
      listFlags.push(query.include_active_lease);
      return query.include_active_lease;
    },
    get: async (_user: unknown, _roomId: string, include: boolean) => {
      detailFlags.push(include);
      return include;
    },
  } as never);
  assert.equal(await controller.list(user, falseDto), false);
  assert.equal(await controller.list(user, trueDto), true);
  assert.equal(await controller.get(user, roomId, 'false'), false);
  assert.equal(await controller.get(user, roomId, 'true'), true);
  assert.deepEqual(listFlags, [false, true]);
  assert.deepEqual(detailFlags, [false, true]);
});

test('direct check-in authorizes property then returns exact LEASE_REQUIRED without write or audit', async () => {
  const events: string[] = [];
  const service = new OccupancyService(
    {
      completeCheckIn: async () => {
        events.push('repository-write');
      },
    } as never,
    {
      assertCanReadProperty: async () => {
        events.push('property-authorized');
      },
    } as never,
    {
      write: async () => {
        events.push('audit-write');
      },
    } as never,
  );

  await assert.rejects(
    () =>
      service.completeCheckIn(user, {
        property_id: propertyId,
        room_id: roomId,
        resident_id: residentId,
        start_date: '2026-07-28',
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.getStatus(), 409);
      assert.deepEqual(response(error), {
        code: 'LEASE_REQUIRED',
        message: 'Move-in must use lease creation',
      });
      return true;
    },
  );
  assert.deepEqual(events, ['property-authorized']);
});

test('direct check-in property denial stops before deterministic resource path', async () => {
  let repositoryCalls = 0;
  const denied = new ForbiddenException({
    code: 'PROPERTY_SCOPE_DENIED',
    message: 'Property access denied',
  });
  const service = new OccupancyService(
    {
      completeCheckIn: async () => {
        repositoryCalls += 1;
      },
    } as never,
    { assertCanReadProperty: async () => Promise.reject(denied) } as never,
    { write: async () => undefined } as never,
  );
  await assert.rejects(
    () =>
      service.completeCheckIn(user, {
        property_id: propertyId,
        room_id: roomId,
        resident_id: residentId,
        start_date: '2026-07-28',
      }),
    (error) => error === denied,
  );
  assert.equal(repositoryCalls, 0);
});

test('lease create flag is deny-by-default and blocks before executeCommand', async () => {
  for (const rows of [
    [],
    [
      {
        property_id: propertyId,
        admin_ux_read: true,
        lease_write: false,
        lease_transfer: false,
        lease_billing_scheduler: false,
      },
    ],
    [
      {
        property_id: propertyId,
        admin_ux_read: false,
        lease_write: true,
        lease_transfer: false,
        lease_billing_scheduler: false,
      },
    ],
  ]) {
    const feature = new LeaseFeatureService({ query: async () => ({ rows }) } as never);
    await assert.rejects(
      () => feature.assertWriteEnabled(propertyId),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenException);
        assert.equal(error.getStatus(), 403);
        assert.deepEqual(response(error), {
          code: 'LEASE_WRITE_DISABLED',
          message: 'Lease creation is not enabled for this property',
        });
        return true;
      },
    );
  }

  let claims = 0;
  const blocker = new ForbiddenException({
    code: 'LEASE_WRITE_DISABLED',
    message: 'Lease creation is not enabled for this property',
  });
  const service = new LeaseService(
    {} as never,
    {
      assertWriteEnabled: async () => Promise.reject(blocker),
    } as never,
  );
  (service as unknown as { executeCommand: () => never }).executeCommand = () => {
    claims += 1;
    throw new Error('executeCommand must not run');
  };
  await assert.rejects(
    () =>
      service.create(
        user,
        {
          property_id: propertyId,
          room_id: roomId,
          resident_id: residentId,
          start_date: '2026-07-28',
          billing_cycle: 'monthly',
        },
        'idempotency-key',
        context,
      ),
    (error) => error === blocker,
  );
  assert.equal(claims, 0);
});

test('every compatibility checkout mutation rejects an active matching lease before write', async () => {
  const writes = { create: 0, approve: 0, reject: 0, finalize: 0 };
  const leaseRequired = new ConflictException({
    code: 'LEASE_CLOSE_REQUIRED',
    message: 'Active lease must be closed through lease lifecycle',
  });
  const repository = {
    findById: async () => occupancy,
    findCheckOutById: async () => checkOut,
    assertLegacyCheckoutEligible: async () => Promise.reject(leaseRequired),
    createCheckOutRequest: async () => {
      writes.create += 1;
      return checkOut;
    },
    updateCheckOutStatus: async (_id: string, status: 'approved' | 'rejected') => {
      writes[status === 'approved' ? 'approve' : 'reject'] += 1;
      return checkOut;
    },
    finalizeCheckOut: async () => {
      writes.finalize += 1;
      return checkOut;
    },
  };
  const service = new OccupancyService(
    repository as never,
    { assertCanReadProperty: async () => undefined } as never,
    { write: async () => undefined } as never,
  );
  const calls = [
    () =>
      service.createCheckOutRequest(
        user,
        { occupancy_id: occupancyId, requested_check_out_date: '2026-07-28' },
        context,
      ),
    () => service.approveCheckOut(user, checkOutId, context),
    () => service.rejectCheckOut(user, checkOutId, context),
    () =>
      service.finalizeCheckOut(
        user,
        checkOutId,
        { end_date: '2026-07-28', room_status_after: 'vacant' },
        context,
      ),
  ];
  for (const call of calls) {
    await assert.rejects(call, (error) => error === leaseRequired);
  }
  assert.deepEqual(writes, { create: 0, approve: 0, reject: 0, finalize: 0 });
});

test('legacy no-lease request remains available and stores only safe audit data', async () => {
  const audits: Array<Record<string, unknown>> = [];
  let writes = 0;
  const service = new OccupancyService(
    {
      findById: async () => occupancy,
      assertLegacyCheckoutEligible: async () => undefined,
      createCheckOutRequest: async () => {
        writes += 1;
        return { ...checkOut, reason: 'must not enter audit' };
      },
    } as never,
    { assertCanReadProperty: async () => undefined } as never,
    { write: async (entry: Record<string, unknown>) => audits.push(entry) } as never,
  );
  await service.createCheckOutRequest(
    user,
    {
      occupancy_id: occupancyId,
      requested_check_out_date: '2026-07-28',
      reason: 'private free-form reason',
    },
    context,
  );
  assert.equal(writes, 1);
  assert.equal(JSON.stringify(audits).includes('private free-form reason'), false);
  assert.equal(JSON.stringify(audits).includes('must not enter audit'), false);
});

test('compatibility mutations use the caller property scope before eligibility or writes', async () => {
  const observedScopes: Array<string[] | undefined> = [];
  let downstreamCalls = 0;
  const repository = {
    findById: async (_id: string, propertyIds?: string[]) => {
      observedScopes.push(propertyIds);
      return null;
    },
    findCheckOutById: async (_id: string, propertyIds?: string[]) => {
      observedScopes.push(propertyIds);
      return null;
    },
    assertLegacyCheckoutEligible: async () => {
      downstreamCalls += 1;
    },
    createCheckOutRequest: async () => {
      downstreamCalls += 1;
      return checkOut;
    },
    updateCheckOutStatus: async () => {
      downstreamCalls += 1;
      return checkOut;
    },
    finalizeCheckOut: async () => {
      downstreamCalls += 1;
      return checkOut;
    },
  };
  const service = new OccupancyService(
    repository as never,
    {
      assertCanReadProperty: async () => {
        downstreamCalls += 1;
      },
    } as never,
    {
      write: async () => {
        downstreamCalls += 1;
      },
    } as never,
  );
  const calls = [
    () =>
      service.createCheckOutRequest(
        user,
        { occupancy_id: occupancyId, requested_check_out_date: '2026-07-28' },
        context,
      ),
    () => service.approveCheckOut(user, checkOutId, context),
    () => service.rejectCheckOut(user, checkOutId, context),
    () =>
      service.finalizeCheckOut(
        user,
        checkOutId,
        { end_date: '2026-07-28', room_status_after: 'vacant' },
        context,
      ),
  ];
  for (const call of calls) {
    await assert.rejects(call, (error: unknown) => error instanceof NotFoundException);
  }
  assert.deepEqual(observedScopes, [[propertyId], [propertyId], [propertyId], [propertyId]]);
  assert.equal(downstreamCalls, 0);
});

test('empty property scope remains deny-all in repository parameters', async () => {
  const parameters: unknown[][] = [];
  const repository = new OccupancyRepository({
    client: {
      query: async (_sql: string, values: unknown[]) => {
        parameters.push(values);
        return { rows: [] };
      },
    },
  } as never);
  await repository.findById(occupancyId, []);
  await repository.findCheckOutById(checkOutId, []);
  await repository.listCheckOutRequests([]);
  assert.deepEqual(parameters, [[occupancyId, []], [checkOutId, []], [[]]]);
});

test('repository enforces exact tuple, transaction-local lease guard, and safe final audit action', async () => {
  const repository = await readFile(
    resolve(root, 'src/modules/occupancy/repositories/occupancy.repository.ts'),
    'utf8',
  );
  const service = await readFile(
    resolve(root, 'src/modules/occupancy/occupancy.service.ts'),
    'utf8',
  );
  const checkInController = await readFile(
    resolve(root, 'src/modules/occupancy/check-in.controller.ts'),
    'utf8',
  );
  assert.doesNotMatch(repository, /completeCheckIn\s*\(/);
  assert.match(checkInController, /@RequireRoles\('owner', 'manager', 'admin'\)/);
  assert.match(checkInController, /@RequirePermissions\('lease\.manage'\)/);
  assert.match(
    repository,
    /occupancy\.property_id = \$2[\s\S]*occupancy\.room_id = \$3[\s\S]*occupancy\.resident_id = \$4/,
  );
  assertFinalizeLocking(repository);
  assert.match(
    repository,
    /WHERE id = \$1[\s\S]*property_id = \$2[\s\S]*occupancy_id = \$3[\s\S]*room_id = \$4[\s\S]*resident_id = \$5[\s\S]*FOR UPDATE/,
  );
  assert.match(service, /action: 'occupancy\.legacy_checkout'/);
  const finalAudit =
    service.match(/action: 'occupancy\.legacy_checkout'[\s\S]*?resultStatus: 'success'/)?.[0] ?? '';
  assert.doesNotMatch(finalAudit, /reason|resident|afterData: finalized/);
  assert.match(finalAudit, /check_out_status[\s\S]*end_date[\s\S]*room_status_after/);
  assert.doesNotMatch(repository, /(?:INSERT|UPDATE)[\s\S]{0,80}(?:leases|invoices)/i);
  assert.throws(() =>
    assertFinalizeLocking(
      repository.replace(
        /const room = await client\.query<\{ id: string \}>\([\s\S]*?if \(!room\.rows\[0\]\) \{[\s\S]*?\n      \}\n\n/,
        '',
      ),
    ),
  );
});

test('Rooms V2 derives reconciliation anomaly with one scoped set query for list and detail', async () => {
  const rooms = await readFile(
    resolve(root, 'src/modules/admin-ux-master/admin-ux-room-v2.service.ts'),
    'utf8',
  );
  assert.match(
    rooms,
    /NOT EXISTS \([\s\S]*FROM leases lease[\s\S]*lease\.occupancy_id = occupancy\.id[\s\S]*lease\.property_id = occupancy\.property_id[\s\S]*lease\.room_id = occupancy\.room_id[\s\S]*lease\.resident_id = occupancy\.resident_id[\s\S]*lease\.lease_status = 'active'/,
  );
  assertPairedRoomPropertyScope(rooms);
  assert.match(
    rooms,
    /lease_reconciliation_required: includeActiveLease[\s\S]*reconciliationByRoom/,
  );
  assert.match(rooms, /hydrate\(result\.rows, query\.include_active_lease \?\? false\)/);
  assert.match(rooms, /roomById\(roomId, includeActiveLease\)/);
  assert.doesNotMatch(rooms, /for \(const row of rows\)[\s\S]*database\.client\.query/);
  assert.throws(() =>
    assertPairedRoomPropertyScope(
      rooms.replace('AND occupancy.property_id = scoped.property_id', ''),
    ),
  );
  assert.throws(() =>
    assertPairedRoomPropertyScope(
      rooms.replace(
        'FROM UNNEST($1::uuid[], $2::uuid[]) AS scoped(room_id, property_id)',
        'FROM occupancies scoped',
      ),
    ),
  );
});

test('lease write gate is create-only and precedes command claim', async () => {
  const service = await readFile(resolve(root, 'src/modules/lease/lease.service.ts'), 'utf8');
  const createBlock = service.match(/async create\([\s\S]*?\n  async [a-zA-Z]/)?.[0] ?? '';
  assert.match(createBlock, /assertPropertyScope[\s\S]*assertWriteEnabled[\s\S]*executeCommand/);
  assert.doesNotMatch(
    service.match(/async close\([\s\S]*?\n  async [a-zA-Z]/)?.[0] ?? '',
    /assertWriteEnabled/,
  );
});
