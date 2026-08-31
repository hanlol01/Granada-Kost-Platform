import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { normalizePagination, v2Data, v2List } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  CreateRoomV2Dto,
  ListRoomBuildingsV2QueryDto,
  ListRoomsV2QueryDto,
  UpdateRoomV2Dto,
  UpdateRoomV2StatusDto,
} from './admin-ux-room-v2.dto';

type Row = Record<string, unknown>;

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_status: number | null;
  response_body: unknown;
};

type FloorCode = 'A' | 'B';

const CANONICAL_FLOOR: Record<FloorCode, { floor: string; floorLabel: string }> = {
  A: { floor: '2', floorLabel: 'Lantai Atas / LT.2' },
  B: { floor: '1', floorLabel: 'Lantai Bawah / LT.1' },
};

function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((details, error) => {
    const property = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) details[property] = Object.values(error.constraints);
    if (error.children?.length) {
      Object.assign(details, flattenValidationErrors(error.children, property));
    }
    return details;
  }, {});
}

@Injectable()
export class AdminUxRoomV2Service {
  private readonly writeValidation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: flattenValidationErrors(errors),
      }),
  });

  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, dto: unknown) {
    const query = await this.validateQuery(ListRoomsV2QueryDto, dto);
    const scope = await this.scope(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const search = this.escapeSearchPattern(query.q);
    const normalizedRoomNumberSearch = this.normalizeRoomNumberSearch(query.q);
    const filters: Array<string | string[] | boolean | null> = [
      scope,
      query.property_id ?? null,
      query.kost_type_id ?? null,
      query.category ?? null,
      query.building_id ?? null,
      query.floor_code ?? null,
      query.status ?? null,
      search,
      normalizedRoomNumberSearch,
    ];
    const optionalFilters: string[] = [];
    if (query.gender_policy !== undefined) {
      filters.push(query.gender_policy);
      optionalFilters.push(`AND room.gender_policy = $${filters.length}`);
    }
    if (query.active_occupancy !== undefined) {
      filters.push(query.active_occupancy);
      optionalFilters.push(`AND (
            EXISTS (
              SELECT 1
              FROM occupancies active_occupancy
              WHERE active_occupancy.property_id = room.property_id
                AND active_occupancy.room_id = room.id
                AND active_occupancy.occupancy_status = 'active'
            ) = $${filters.length}
          )`);
    }
    if (query.reconciliation_state !== undefined) {
      filters.push(query.reconciliation_state);
      optionalFilters.push(`AND (
            (
              $${filters.length} = 'requires_review' AND
              EXISTS (
                SELECT 1
                FROM occupancies review_occupancy
                WHERE review_occupancy.property_id = room.property_id
                  AND review_occupancy.room_id = room.id
                  AND review_occupancy.occupancy_status = 'active'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM leases review_lease
                    WHERE review_lease.property_id = room.property_id
                      AND review_lease.room_id = room.id
                      AND review_lease.resident_id = review_occupancy.resident_id
                      AND review_lease.lease_status = 'active'
                  )
              )
            ) OR (
              $${filters.length} = 'normal' AND
              NOT EXISTS (
                SELECT 1
                FROM occupancies review_occupancy
                WHERE review_occupancy.property_id = room.property_id
                  AND review_occupancy.room_id = room.id
                  AND review_occupancy.occupancy_status = 'active'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM leases review_lease
                    WHERE review_lease.property_id = room.property_id
                      AND review_lease.room_id = room.id
                      AND review_lease.resident_id = review_occupancy.resident_id
                      AND review_lease.lease_status = 'active'
                  )
              )
            )
          )`);
    }
    const fromAndWhere = `FROM rooms room
       JOIN kost_types kost_type
         ON kost_type.id = room.kost_type_id
        AND kost_type.property_id = room.property_id
       JOIN LATERAL (
         SELECT version.monthly_price, version.annual_contract_value,
                version.security_deposit_months
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= CURRENT_DATE
         ORDER BY version.effective_date DESC, version.id DESC
         LIMIT 1
       ) commercial_version ON true
       LEFT JOIN room_buildings building
         ON building.id = room.building_id
        AND building.property_id = room.property_id
       WHERE ($1::uuid[] IS NULL OR room.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR room.property_id = $2)
         AND ($3::uuid IS NULL OR room.kost_type_id = $3)
         AND ($4::text IS NULL OR kost_type.category = $4)
         AND ($5::uuid IS NULL OR building.id = $5)
         AND ($6::text IS NULL OR room.floor_code = $6)
         AND ($7::text IS NULL OR room.room_status = $7)
         AND ($8::text IS NULL OR
           room.number ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           room.room_code ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           ($9::text IS NOT NULL AND
             regexp_replace(room.number, '[^[:alnum:]]', '', 'g')
               ILIKE '%' || $9 || '%' ESCAPE E'\\\\') OR
           ($9::text IS NOT NULL AND
             regexp_replace(COALESCE(room.room_code, ''), '[^[:alnum:]]', '', 'g')
               ILIKE '%' || $9 || '%' ESCAPE E'\\\\') OR
           building.building_code ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           building.building_name ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           kost_type.name ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           CASE kost_type.category
             WHEN 'rukost' THEN 'Rumah Kost'
             WHEN 'apartkost' THEN 'Apart Kost'
           END ILIKE '%' || $8 || '%' ESCAPE E'\\\\' OR
           EXISTS (
             SELECT 1
             FROM occupancies active_occupancy
             JOIN residents active_resident
               ON active_resident.id = active_occupancy.resident_id
              AND active_resident.property_id = active_occupancy.property_id
             WHERE active_occupancy.property_id = room.property_id
               AND active_occupancy.room_id = room.id
               AND active_occupancy.occupancy_status = 'active'
               AND active_resident.full_name ILIKE '%' || $8 || '%' ESCAPE E'\\\\'
           )
          )
         ${optionalFilters.join('\n         ')}`;
    const countResult = await this.database.client.query<{
      total: number;
      commercial_drift?: boolean;
    }>(
      `SELECT COUNT(*)::int AS total,
              EXISTS (
                SELECT 1
                FROM properties reconciliation_property
                WHERE reconciliation_property.status = 'active'
                  AND ($1::uuid[] IS NULL OR reconciliation_property.id = ANY($1::uuid[]))
                  AND ($2::uuid IS NULL OR reconciliation_property.id = $2)
                  AND (
                    (
                      SELECT COUNT(*)
                      FROM kost_types reconciliation_type
                      WHERE reconciliation_type.property_id = reconciliation_property.id
                        AND reconciliation_type.status = 'active'
                        AND reconciliation_type.deleted_at IS NULL
                    ) <> 2
                    OR EXISTS (
                      SELECT 1
                      FROM rooms reconciliation_room
                      LEFT JOIN kost_types reconciliation_type
                        ON reconciliation_type.id = reconciliation_room.kost_type_id
                       AND reconciliation_type.property_id = reconciliation_room.property_id
                       AND reconciliation_type.category = reconciliation_room.category
                       AND reconciliation_type.deleted_at IS NULL
                      WHERE reconciliation_room.property_id = reconciliation_property.id
                        AND (
                          reconciliation_type.id IS NULL
                          OR NOT EXISTS (
                            SELECT 1
                            FROM kost_type_commercial_versions reconciliation_version
                            WHERE reconciliation_version.kost_type_id = reconciliation_type.id
                              AND reconciliation_version.effective_date <= CURRENT_DATE
                          )
                        )
                    )
                  )
              ) AS commercial_drift
       ${fromAndWhere}`,
      filters,
    );
    if (countResult.rows[0]?.commercial_drift) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED',
        message: 'Room category commercial authority requires reconciliation.',
      });
    }
    const total = Number(countResult.rows[0]?.total ?? 0);
    if (total === 0 || offset >= total) {
      return v2List([], limit, offset, total);
    }
    const orderBy = this.roomOrderBy(query.sort, query.order);
    const limitParameter = filters.length + 1;
    const offsetParameter = filters.length + 2;
    const result = await this.database.client.query<Row>(
      `SELECT
         room.id, room.property_id, room.kost_type_id, room.number, room.room_code, room.building_id,
         room.unit_code, room.gender_policy, room.floor, room.floor_code, room.floor_label, room.size_label,
         room.room_status, room.primary_photo_file_id, room.public_visible, room.created_at, room.updated_at,
         kost_type.name AS kost_type_name, kost_type.slug AS kost_type_slug, kost_type.category AS kost_type_category,
         commercial_version.monthly_price,
         commercial_version.annual_contract_value AS yearly_price,
         (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
           AS deposit_amount,
         building.building_code, building.building_name
       ${fromAndWhere}
       ORDER BY ${orderBy}, room.id
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [...filters, limit, offset],
    );
    const records = await this.hydrate(result.rows, query.include_active_lease ?? false);
    return v2List(records, limit, offset, total);
  }

  async buildings(user: UserAccessContext, query: ListRoomBuildingsV2QueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const result = await this.database.client.query<Row>(
      `SELECT id, property_id, category, building_code, building_name, gender_policy
       FROM room_buildings
       WHERE property_id = $1
         AND ($2::text IS NULL OR category = $2)
       ORDER BY category, building_code, id`,
      [query.property_id, query.category ?? null],
    );
    return v2Data(
      result.rows.map((row) => ({
        id: row.id,
        property_id: row.property_id,
        category: row.category,
        building_code: row.building_code,
        building_name: row.building_name,
        gender_policy: row.gender_policy,
      })),
    );
  }

  async get(user: UserAccessContext, roomId: string, includeActiveLease = false) {
    const row = await this.requireRoom(roomId);
    await this.properties.assertCanReadProperty(user, String(row.property_id));
    const full = await this.roomById(roomId, includeActiveLease);
    return v2Data(full);
  }

  async create(
    user: UserAccessContext,
    dto: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const input = await this.validateWriteBody(CreateRoomV2Dto, dto);
    await this.assertCanMutate(user, input.property_id);
    void context;
    void idempotencyKey;
    this.throwFixedInventory();
  }

  async rejectRoutineCreate(user: UserAccessContext, propertyId: string): Promise<never> {
    await this.assertCanMutate(user, propertyId);
    this.throwFixedInventory();
  }

  async update(
    user: UserAccessContext,
    roomId: string,
    dto: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    this.assertNoCommercialFields(dto);
    const input = await this.validateWriteBody(UpdateRoomV2Dto, dto);
    const scope = await this.lookupScopedRoom(user, roomId);
    const propertyId = String(scope.property_id);
    await this.assertCanMutate(user, propertyId);

    return this.executeCommand(
      user,
      propertyId,
      `/rooms/${roomId}`,
      idempotencyKey,
      input,
      context,
      200,
      async (client) => {
        const before = await this.lockScopedRoom(client, roomId, propertyId);
        const beforeBuildingId = this.stringOrEmpty(before.building_id);
        const proposedBuildingId = input.building_id ?? beforeBuildingId;
        const buildingIds = [beforeBuildingId, proposedBuildingId].filter(Boolean);
        const buildings = await this.lockBuildings(client, propertyId, buildingIds);
        const building = buildings.get(proposedBuildingId);
        if (!building) this.throwBuildingScopeMismatch();
        const proposedKostTypeId = String(input.kost_type_id ?? before.kost_type_id);
        const kostType = await this.requireActiveKostType(
          proposedKostTypeId,
          propertyId,
          client,
          true,
        );
        this.assertBuildingMatchesType(building, kostType);
        this.assertBuildingGender(building, input.gender_policy);
        const buildingChanged =
          input.building_id !== undefined && input.building_id !== beforeBuildingId;

        const proposedFloorCode = (input.floor_code ?? before.floor_code) as FloorCode | undefined;
        const canonicalFloor = proposedFloorCode
          ? this.canonicalFloor(proposedFloorCode)
          : { floor: before.floor ?? null, floorLabel: before.floor_label ?? null };
        this.assertFloorInputs(input, canonicalFloor);
        const proposed = {
          kostTypeId: proposedKostTypeId,
          buildingId: proposedBuildingId,
          category: String(building.category),
          number: input.number ?? String(before.number),
          roomCode: input.room_code !== undefined ? input.room_code : (before.room_code ?? null),
          unitCode: input.unit_code !== undefined ? input.unit_code : (before.unit_code ?? null),
          genderPolicy:
            buildingChanged || input.gender_policy !== undefined
              ? String(building.gender_policy)
              : String(before.gender_policy),
          floor: canonicalFloor.floor,
          floorCode: proposedFloorCode ?? null,
          floorLabel: canonicalFloor.floorLabel,
          sizeLabel:
            input.size_label !== undefined ? input.size_label : (before.size_label ?? null),
          primaryPhotoFileId:
            input.primary_photo_file_id !== undefined
              ? input.primary_photo_file_id
              : (before.primary_photo_file_id ?? null),
          publicVisible: input.public_visible ?? Boolean(before.public_visible),
        };
        const structuralChanged = this.structuralRoomChanged(before, proposed);
        if (structuralChanged) {
          await this.assertStructuralEditAllowed(client, before);
        }
        if (typeof proposed.primaryPhotoFileId === 'string') {
          await this.assertPhotoFile(proposed.primaryPhotoFileId, propertyId, client);
        }

        const result = await client.query<Row>(
          `UPDATE rooms
           SET kost_type_id = $3, number = $4, room_code = $5, building_id = $6, category = $7,
               unit_code = $8, gender_policy = $9, floor = $10, floor_code = $11, floor_label = $12,
                size_label = $13, primary_photo_file_id = $14, public_visible = $15,
                updated_by_user_id = $16, updated_at = now()
           WHERE id = $1 AND property_id = $2
           RETURNING id`,
          [
            roomId,
            propertyId,
            proposed.kostTypeId,
            proposed.number,
            proposed.roomCode,
            proposed.buildingId,
            proposed.category,
            proposed.unitCode,
            proposed.genderPolicy,
            proposed.floor,
            proposed.floorCode,
            proposed.floorLabel,
            proposed.sizeLabel,
            proposed.primaryPhotoFileId,
            proposed.publicVisible,
            user.id,
          ],
        );
        if (!result.rows[0]) this.throwRoomNotFound();
        if (
          structuralChanged &&
          (beforeBuildingId !== proposed.buildingId ||
            this.stringOrEmpty(before.floor_code) !== this.stringOrEmpty(proposed.floorCode))
        ) {
          await this.applyRoomMoveCounters(client, before, proposed);
        }
        const room = await this.roomById(roomId, false, client, propertyId);
        await this.audit.write(
          {
            actorUserId: user.id,
            propertyId,
            action: 'room.update.v2',
            resourceType: 'room',
            resourceId: roomId,
            beforeData: this.auditRoom(before),
            afterData: this.auditRoom(room),
            resultStatus: 'success',
            ...context,
          },
          client,
        );
        return { resourceType: 'room', resourceId: roomId, data: room };
      },
    );
  }

  async updateStatus(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomV2StatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutate(user, String(before.property_id));
    // W07B decision 5: fail closed. Rooms awaiting transfer inspection can only
    // be resolved through POST /rooms/:roomId/inspection-resolution.
    if (String(before.room_status) === 'inspection_required') {
      throw new ConflictException({
        code: 'ROOM_INSPECTION_LOCKED',
        message:
          'Room is awaiting transfer inspection; use POST /rooms/:roomId/inspection-resolution to resolve it',
      });
    }
    if (!['maintenance', 'inactive', 'requires_review', 'vacant'].includes(dto.status)) {
      throw new UnprocessableEntityException({
        code: 'ROOM_STATUS_MANAGED_BY_LEASE',
        message:
          'Occupied, reserved, and awaiting-check-in statuses are managed by the lease lifecycle.',
      });
    }
    const movingToVacant = dto.status === 'vacant';
    const validSource = movingToVacant
      ? ['maintenance', 'inactive', 'requires_review'].includes(String(before.room_status))
      : before.room_status === 'vacant';
    if (!validSource) {
      throw new ConflictException({
        code: 'ROOM_STATUS_TRANSITION_INVALID',
        message: 'The requested room status transition is not allowed.',
      });
    }
    const activeOccupancy = await this.database.client.query<{ id: string }>(
      `SELECT id FROM occupancies WHERE room_id = $1 AND occupancy_status = 'active' LIMIT 1`,
      [roomId],
    );
    if (activeOccupancy.rows[0]) {
      throw new ConflictException({
        code: 'ROOM_ACTIVE_OCCUPANCY_EXISTS',
        message: 'Room has an active occupancy.',
      });
    }
    await this.requireActiveKostType(String(before.kost_type_id), String(before.property_id));
    const updated = await this.database.client.query<Row>(
      `UPDATE rooms SET room_status = $2, updated_by_user_id = $3, updated_at = now() WHERE id = $1 RETURNING id`,
      [roomId, dto.status, user.id],
    );
    if (!updated.rows[0])
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    const room = await this.roomById(roomId, false);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'room.status_update.v2',
      resourceType: 'room',
      resourceId: roomId,
      beforeData: this.auditRoom(before),
      afterData: { room, reason: dto.reason.trim() },
      resultStatus: 'success',
      ...context,
    });
    return v2Data(room);
  }

  private async roomById(
    roomId: string,
    includeActiveLease: boolean,
    client?: PoolClient,
    propertyId?: string,
  ) {
    const queryable = client ?? this.database.client;
    const result = await queryable.query<Row>(
      `SELECT
         room.id, room.property_id, room.kost_type_id, room.number, room.room_code, room.building_id,
         room.unit_code, room.gender_policy, room.floor, room.floor_code, room.floor_label, room.size_label,
         room.room_status, room.primary_photo_file_id, room.public_visible, room.created_at, room.updated_at,
         kost_type.name AS kost_type_name, kost_type.slug AS kost_type_slug, kost_type.category AS kost_type_category,
         commercial_version.monthly_price,
         commercial_version.annual_contract_value AS yearly_price,
         (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
           AS deposit_amount,
         building.building_code, building.building_name
       FROM rooms room
       JOIN kost_types kost_type
         ON kost_type.id = room.kost_type_id
        AND kost_type.property_id = room.property_id
        AND kost_type.category = room.category
        AND kost_type.deleted_at IS NULL
       JOIN LATERAL (
         SELECT version.monthly_price, version.annual_contract_value,
                version.security_deposit_months
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= CURRENT_DATE
         ORDER BY version.effective_date DESC, version.id DESC
         LIMIT 1
       ) commercial_version ON true
       LEFT JOIN room_buildings building
         ON building.id = room.building_id
        AND building.property_id = room.property_id
       WHERE room.id = $1
         AND ($2::uuid IS NULL OR room.property_id = $2)`,
      [roomId, propertyId ?? null],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    return (await this.hydrate(result.rows, includeActiveLease, client))[0];
  }

  private async hydrate(rows: Row[], includeActiveLease: boolean, client?: PoolClient) {
    if (!rows.length) return [];
    const queryable = client ?? this.database.client;
    const typeScopes = [
      ...new Map(
        rows.map((row) => [
          `${String(row.property_id)}:${String(row.kost_type_id)}`,
          { propertyId: String(row.property_id), kostTypeId: String(row.kost_type_id) },
        ]),
      ).values(),
    ];
    const typeIds = typeScopes.map((scope) => scope.kostTypeId);
    const typePropertyIds = typeScopes.map((scope) => scope.propertyId);
    const roomIds = rows.map((row) => String(row.id));
    const propertyIds = rows.map((row) => String(row.property_id));
    const [facilities, occupancies] = await Promise.all([
      queryable.query<Row>(
        `WITH scoped AS (
           SELECT unnest($1::uuid[]) AS kost_type_id,
                  unnest($2::uuid[]) AS property_id
         )
         SELECT facility.kost_type_id, facility.id, facility.label AS name,
                NULL::text AS icon, facility.public_description AS description,
                NULL::uuid AS category_id, facility.sort_order
         FROM scoped
         JOIN kost_type_content_facilities facility
           ON facility.kost_type_id = scoped.kost_type_id
          AND facility.property_id = scoped.property_id
         WHERE facility.content_state = 'active'
           AND facility.archived_at IS NULL
         ORDER BY facility.sort_order, facility.normalized_label`,
        [typeIds, typePropertyIds],
      ),
      includeActiveLease
        ? queryable.query<Row>(
            `SELECT occupancy.room_id, occupancy.id, occupancy.resident_id, occupancy.start_date,
                    resident.full_name AS resident_name,
                    NOT EXISTS (
                      SELECT 1
                      FROM leases lease
                      WHERE lease.occupancy_id = occupancy.id
                        AND lease.property_id = occupancy.property_id
                        AND lease.room_id = occupancy.room_id
                        AND lease.resident_id = occupancy.resident_id
                        AND lease.lease_status = 'active'
                    ) AS lease_reconciliation_required
             FROM UNNEST($1::uuid[], $2::uuid[]) AS scoped(room_id, property_id)
             JOIN occupancies occupancy
               ON occupancy.room_id = scoped.room_id
              AND occupancy.property_id = scoped.property_id
              JOIN residents resident
                ON resident.id = occupancy.resident_id
               AND resident.property_id = occupancy.property_id
             WHERE occupancy.occupancy_status = 'active'`,
            [roomIds, propertyIds],
          )
        : Promise.resolve({ rows: [] as Row[] }),
    ]);
    const facilitiesByType = new Map<string, Record<string, unknown>[]>();
    for (const facility of facilities.rows) {
      const list = facilitiesByType.get(String(facility.kost_type_id)) ?? [];
      list.push(this.roomFacility(facility));
      facilitiesByType.set(String(facility.kost_type_id), list);
    }
    const occupancyByRoom = new Map<string, Record<string, unknown>>();
    const reconciliationByRoom = new Map<string, boolean>();
    for (const occupancy of occupancies.rows) {
      occupancyByRoom.set(String(occupancy.room_id), {
        id: occupancy.id,
        resident_id: occupancy.resident_id,
        resident_name: occupancy.resident_name,
        start_date: occupancy.start_date,
      });
      reconciliationByRoom.set(
        String(occupancy.room_id),
        occupancy.lease_reconciliation_required === true,
      );
    }
    return rows.map((row) => ({
      id: row.id,
      property_id: row.property_id,
      number: row.number,
      room_code: row.room_code,
      building_id: row.building_id,
      building_code: row.building_code,
      building_name: row.building_name,
      unit_code: row.unit_code,
      gender_policy: row.gender_policy,
      floor: row.floor,
      floor_code: row.floor_code,
      floor_label: row.floor_label,
      size_label: row.size_label,
      status: row.room_status,
      primary_photo_file_id: row.primary_photo_file_id,
      public_visible: row.public_visible,
      created_at: row.created_at,
      updated_at: row.updated_at,
      kost_type: {
        id: row.kost_type_id,
        name: row.kost_type_name,
        slug: row.kost_type_slug,
        category: row.kost_type_category,
        monthly_price: Number(row.monthly_price),
        yearly_price: Number(row.yearly_price),
        deposit_amount: Number(row.deposit_amount),
        facilities: facilitiesByType.get(String(row.kost_type_id)) ?? [],
      },
      active_lease: null,
      active_occupancy: includeActiveLease
        ? (occupancyByRoom.get(String(row.id)) ?? null)
        : undefined,
      lease_reconciliation_required: includeActiveLease
        ? (reconciliationByRoom.get(String(row.id)) ?? false)
        : undefined,
    }));
  }

  private roomFacility(row: Row) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      category_id: row.category_id,
      sort_order: Number(row.sort_order),
    };
  }

  private async requireRoom(id: string): Promise<Row> {
    const result = await this.database.client.query<Row>('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!result.rows[0])
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    return result.rows[0];
  }

  private async requireActiveKostType(
    id: string,
    propertyId: string,
    client?: PoolClient,
    lock = false,
  ): Promise<Row> {
    const result = await (client ?? this.database.client).query<Row>(
      `SELECT * FROM kost_types
       WHERE id = $1 AND property_id = $2
         AND status = 'active' AND deleted_at IS NULL
       ${lock ? 'FOR KEY SHARE' : ''}`,
      [id, propertyId],
    );
    if (!result.rows[0]) {
      throw new UnprocessableEntityException({
        code: 'ROOM_KOST_TYPE_MISMATCH',
        message: 'Room requires an active kost type in the same property.',
      });
    }
    return result.rows[0];
  }

  private async requireBuilding(id: string, propertyId: string): Promise<Row> {
    const result = await this.database.client.query<Row>(
      'SELECT * FROM room_buildings WHERE id = $1 AND property_id = $2',
      [id, propertyId],
    );
    if (!result.rows[0])
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Building belongs to another property.',
      });
    return result.rows[0];
  }

  private assertBuildingMatchesType(building: Row, kostType: Row): void {
    if (building.category !== kostType.category) {
      throw new UnprocessableEntityException({
        code: 'ROOM_KOST_TYPE_MISMATCH',
        message: 'Building category and kost type category must match.',
      });
    }
  }

  private async assertPhotoFile(
    fileId: string,
    propertyId: string,
    client?: PoolClient,
  ): Promise<void> {
    const result = await (client ?? this.database.client).query<Row>(
      `SELECT id FROM files
       WHERE id = $1 AND property_id = $2 AND is_deleted = false AND file_purpose = 'room_photo'
         AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')`,
      [fileId, propertyId],
    );
    if (!result.rows[0])
      throw new UnprocessableEntityException({
        code: 'ROOM_PHOTO_INVALID',
        message: 'Room photo must be an active image in the same property.',
      });
  }

  private assertNoCommercialFields(dto: unknown): void {
    const input = dto && typeof dto === 'object' ? (dto as Record<string, unknown>) : {};
    if (
      input.monthly_price !== undefined ||
      input.yearly_price !== undefined ||
      input.deposit_amount !== undefined ||
      input.facility_ids !== undefined ||
      input.monthlyPrice !== undefined ||
      input.yearlyPrice !== undefined ||
      input.depositAmount !== undefined ||
      input.facilityIds !== undefined ||
      input.minimum_dp_percent !== undefined ||
      input.minimumDpPercent !== undefined ||
      input.payment_schedules !== undefined ||
      input.paymentSchedules !== undefined ||
      input.security_deposit_months !== undefined ||
      input.securityDepositMonths !== undefined
    ) {
      throw new BadRequestException({
        code: 'IMMUTABLE_ROOM_COMMERCIAL_FIELD',
        message: 'Room pricing, deposit, and facilities are controlled by kost type.',
      });
    }
  }

  private async validateWriteBody<T extends object>(
    metatype: new () => T,
    value: unknown,
  ): Promise<T> {
    return this.writeValidation.transform(value, { type: 'body', metatype }) as Promise<T>;
  }

  private async executeCommand<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    context: RequestAuditContext,
    status: number,
    operation: (
      client: PoolClient,
    ) => Promise<{ resourceType: string; resourceId: string; data: T }>,
  ): Promise<{ data: T }> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.requestFingerprint({
      route,
      actor_id: user.id,
      property_id: propertyId,
      payload,
    });
    try {
      const result = await this.database.transaction(async (client) => {
        await this.lockProperty(client, propertyId);
        const command = await this.claimCommand(
          client,
          propertyId,
          user.id,
          route,
          key,
          fingerprint,
          context.correlationId,
        );
        if (command) return command.body as { data: T };
        const output = await operation(client);
        const body = JSON.parse(JSON.stringify(v2Data(output.data))) as { data: T };
        await client.query(
          `UPDATE idempotency_commands
           SET command_status = 'succeeded', response_status = $2, response_body = $3::jsonb,
               resource_type = $4, resource_id = $5, completed_at = now()
           WHERE actor_user_id = $1 AND route = $6 AND idempotency_key = $7`,
          [
            user.id,
            status,
            JSON.stringify(body),
            output.resourceType,
            output.resourceId,
            route,
            key,
          ],
        );
        return body;
      });
      return result;
    } catch (error) {
      this.rethrowRoomConflict(error);
    }
  }

  private async claimCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<{ status: number; body: { data: unknown } } | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_status, response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Command claim is unavailable; retry with the same key',
      });
    }
    if (row.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (row.command_status === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    if (!row.response_status || !row.response_body || typeof row.response_body !== 'object') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    return { status: row.response_status, body: row.response_body as { data: unknown } };
  }

  private async lockProperty(client: PoolClient, propertyId: string): Promise<void> {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM properties WHERE id = $1 FOR KEY SHARE',
      [propertyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
    }
  }

  private async lookupScopedRoom(user: UserAccessContext, roomId: string): Promise<Row> {
    const scope = user.roles.includes('owner') ? null : user.propertyIds;
    if (scope !== null && scope.length === 0) {
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property',
      });
    }
    const result = await this.database.client.query<Row>(
      `SELECT property_id
       FROM rooms
       WHERE id = $1
         AND ($2::uuid[] IS NULL OR property_id = ANY($2::uuid[]))`,
      [roomId, scope],
    );
    if (!result.rows[0]) this.throwRoomNotFound();
    return result.rows[0];
  }

  private async lockScopedRoom(
    client: PoolClient,
    roomId: string,
    propertyId: string,
  ): Promise<Row> {
    const result = await client.query<Row>(
      'SELECT * FROM rooms WHERE id = $1 AND property_id = $2 FOR UPDATE',
      [roomId, propertyId],
    );
    if (!result.rows[0]) this.throwRoomNotFound();
    return result.rows[0];
  }

  private async lockBuildings(
    client: PoolClient,
    propertyId: string,
    buildingIds: string[],
  ): Promise<Map<string, Row>> {
    const ids = [...new Set(buildingIds)].sort();
    if (!ids.length) return new Map();
    const result = await client.query<Row>(
      `SELECT * FROM room_buildings
       WHERE property_id = $1 AND id = ANY($2::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [propertyId, ids],
    );
    if (result.rows.length !== ids.length) this.throwBuildingScopeMismatch();
    return new Map(result.rows.map((row) => [String(row.id), row]));
  }

  private assertBuildingGender(building: Row, supplied?: 'male' | 'female'): void {
    const gender = String(building.gender_policy);
    if (gender !== 'male' && gender !== 'female') {
      throw new UnprocessableEntityException({
        code: 'ROOM_BUILDING_GENDER_INVALID',
        message: 'Building must have a canonical male or female gender policy.',
      });
    }
    if (supplied !== undefined && supplied !== gender) {
      throw new UnprocessableEntityException({
        code: 'ROOM_GENDER_POLICY_MISMATCH',
        message: 'Room gender policy must match the authoritative building.',
      });
    }
  }

  private canonicalFloor(code: FloorCode): { floor: string; floorLabel: string } {
    return CANONICAL_FLOOR[code];
  }

  private assertFloorInputs(
    input: Pick<CreateRoomV2Dto | UpdateRoomV2Dto, 'floor' | 'floor_label'>,
    canonical: { floor: unknown; floorLabel: unknown },
  ): void {
    if (
      (input.floor !== undefined && input.floor !== canonical.floor) ||
      (input.floor_label !== undefined && input.floor_label !== canonical.floorLabel)
    ) {
      throw new UnprocessableEntityException({
        code: 'ROOM_FLOOR_MISMATCH',
        message: 'Floor values must match the canonical floor code.',
      });
    }
  }

  private structuralRoomChanged(
    before: Row,
    proposed: {
      kostTypeId: string;
      buildingId: string;
      category: string;
      number: string;
      roomCode: unknown;
      unitCode: unknown;
      genderPolicy: string;
      floor: unknown;
      floorCode: unknown;
      floorLabel: unknown;
    },
  ): boolean {
    const normalized = (value: unknown) => (value === undefined ? null : value);
    return (
      String(before.kost_type_id) !== proposed.kostTypeId ||
      this.stringOrEmpty(before.building_id) !== proposed.buildingId ||
      this.stringOrEmpty(before.category) !== proposed.category ||
      String(before.number) !== proposed.number ||
      normalized(before.room_code) !== normalized(proposed.roomCode) ||
      normalized(before.unit_code) !== normalized(proposed.unitCode) ||
      this.stringOrEmpty(before.gender_policy) !== proposed.genderPolicy ||
      normalized(before.floor) !== normalized(proposed.floor) ||
      normalized(before.floor_code) !== normalized(proposed.floorCode) ||
      normalized(before.floor_label) !== normalized(proposed.floorLabel)
    );
  }

  private async assertStructuralEditAllowed(client: PoolClient, room: Row): Promise<void> {
    const roomId = String(room.id);
    const propertyId = String(room.property_id);
    const hold = await client.query<{ id: string }>(
      `SELECT id FROM booking_lead_holds
       WHERE property_id = $1 AND room_id = $2 AND hold_status IN ('active','committed')
       ORDER BY id FOR UPDATE`,
      [propertyId, roomId],
    );
    const occupancy = await client.query<{ id: string }>(
      `SELECT id FROM occupancies
       WHERE property_id = $1 AND room_id = $2 AND occupancy_status = 'active'
       ORDER BY id FOR UPDATE`,
      [propertyId, roomId],
    );
    const lease = await client.query<{ id: string }>(
      `SELECT id FROM leases
       WHERE property_id = $1 AND room_id = $2 AND lease_status = 'active'
       ORDER BY id FOR UPDATE`,
      [propertyId, roomId],
    );
    const maintenance = await client.query<{ id: string }>(
      `SELECT id FROM maintenance_work_orders
       WHERE property_id = $1 AND room_id = $2
         AND work_order_status NOT IN ('verified', 'cancelled')
       ORDER BY id FOR UPDATE`,
      [propertyId, roomId],
    );
    if (
      room.room_status === 'reserved' ||
      room.room_status === 'occupied' ||
      room.room_status === 'maintenance' ||
      room.room_status === 'requires_review' ||
      hold.rows.length > 0 ||
      occupancy.rows.length > 0 ||
      lease.rows.length > 0 ||
      maintenance.rows.length > 0
    ) {
      throw new ConflictException({
        code: 'ROOM_STRUCTURAL_EDIT_BLOCKED',
        message: 'Room structural identity cannot change while an active lifecycle exists.',
      });
    }
  }

  private async applyRoomMoveCounters(
    client: PoolClient,
    before: Row,
    proposed: { buildingId: string; floorCode: unknown },
  ): Promise<void> {
    const oldBuildingId = this.stringOrEmpty(before.building_id);
    const oldFloor = before.floor_code;
    const newFloor = proposed.floorCode;
    if (
      !oldBuildingId ||
      (oldFloor !== 'A' && oldFloor !== 'B') ||
      (newFloor !== 'A' && newFloor !== 'B')
    ) {
      throw new ConflictException({
        code: 'ROOM_BUILDING_COUNTER_INVALID',
        message: 'Room structural move requires canonical building and floor references.',
      });
    }
    const deltas = new Map<string, { total: number; floorA: number; floorB: number }>();
    const add = (buildingId: string, total: number, floor: FloorCode, amount: number) => {
      const current = deltas.get(buildingId) ?? { total: 0, floorA: 0, floorB: 0 };
      current.total += total;
      current.floorA += floor === 'A' ? amount : 0;
      current.floorB += floor === 'B' ? amount : 0;
      deltas.set(buildingId, current);
    };
    add(oldBuildingId, oldBuildingId === proposed.buildingId ? 0 : -1, oldFloor, -1);
    add(proposed.buildingId, oldBuildingId === proposed.buildingId ? 0 : 1, newFloor, 1);
    await this.applyCounterDeltas(
      client,
      [...deltas.entries()].map(([buildingId, delta]) => ({ buildingId, ...delta })),
    );
  }

  private async applyCounterDeltas(
    client: PoolClient,
    deltas: Array<{ buildingId: string; total: number; floorA: number; floorB: number }>,
  ): Promise<void> {
    for (const delta of [...deltas].sort((left, right) =>
      left.buildingId.localeCompare(right.buildingId),
    )) {
      if (delta.total === 0 && delta.floorA === 0 && delta.floorB === 0) continue;
      const result = await client.query<{ id: string }>(
        `UPDATE room_buildings
         SET total_rooms = total_rooms + $2,
             floor_a_count = floor_a_count + $3,
             floor_b_count = floor_b_count + $4,
             updated_at = now()
         WHERE id = $1
           AND total_rooms + $2 >= 0
           AND floor_a_count + $3 >= 0
           AND floor_b_count + $4 >= 0
         RETURNING id`,
        [delta.buildingId, delta.total, delta.floorA, delta.floorB],
      );
      if (!result.rows[0]) {
        throw new ConflictException({
          code: 'ROOM_BUILDING_COUNTER_INVALID',
          message: 'Room building counters cannot become negative.',
        });
      }
    }
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private validateQuery<T extends object>(metatype: new () => T, value: unknown): Promise<T> {
    return this.writeValidation.transform(value, {
      type: 'query',
      metatype,
    }) as Promise<T>;
  }

  private escapeSearchPattern(value?: string): string | null {
    return value ? value.replace(/[\\%_]/g, '\\$&') : null;
  }

  private normalizeRoomNumberSearch(value?: string): string | null {
    const normalized = value?.replace(/[^a-zA-Z0-9]/g, '');
    return normalized ? this.escapeSearchPattern(normalized) : null;
  }

  private roomOrderBy(
    sort: ListRoomsV2QueryDto['sort'],
    order: ListRoomsV2QueryDto['order'],
  ): string {
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    const columns: Record<NonNullable<ListRoomsV2QueryDto['sort']>, string> = {
      room_number: 'room.number',
      building: 'building.building_code',
      category: 'kost_type.category',
      gender_policy: 'room.gender_policy',
      status: 'room.room_status',
      active_resident: `(SELECT active_resident.full_name
        FROM occupancies active_occupancy
        JOIN residents active_resident
          ON active_resident.id = active_occupancy.resident_id
         AND active_resident.property_id = active_occupancy.property_id
        WHERE active_occupancy.property_id = room.property_id
          AND active_occupancy.room_id = room.id
          AND active_occupancy.occupancy_status = 'active'
        ORDER BY active_occupancy.start_date DESC, active_occupancy.id DESC
        LIMIT 1)`,
      updated_at: 'room.updated_at',
    };
    return `${columns[sort ?? 'room_number']} ${direction} NULLS LAST`;
  }

  private throwFixedInventory(): never {
    throw new ConflictException({
      code: 'ROOM_INVENTORY_FIXED',
      message: 'Room inventory is fixed and cannot be expanded through routine operations.',
    });
  }

  private stringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private throwRoomNotFound(): never {
    throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
  }

  private throwBuildingScopeMismatch(): never {
    throw new UnprocessableEntityException({
      code: 'PROPERTY_SCOPE_MISMATCH',
      message: 'Building belongs to another property.',
    });
  }

  private async scope(user: UserAccessContext, propertyId?: string): Promise<string[] | null> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return user.roles.includes('owner') ? null : [propertyId];
    }
    return user.roles.includes('owner') ? null : user.propertyIds;
  }

  private async assertCanMutate(user: UserAccessContext, propertyId: string): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate room inventory.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private auditRoom(row: Row) {
    return {
      id: row.id,
      property_id: row.property_id,
      kost_type_id: row.kost_type_id,
      number: row.number,
      room_code: row.room_code,
      building_id: row.building_id,
      category: row.category ?? (row.kost_type as Row | undefined)?.category,
      unit_code: row.unit_code,
      gender_policy: row.gender_policy,
      floor: row.floor,
      floor_code: row.floor_code,
      floor_label: row.floor_label,
      size_label: row.size_label,
      status: row.status ?? row.room_status,
      primary_photo_file_id: row.primary_photo_file_id,
      public_visible: row.public_visible,
    };
  }

  private rethrowRoomConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      String(error.code) === '23505'
    ) {
      throw new ConflictException({
        code: 'ROOM_CONFLICT',
        message: 'Room number or code already exists in this property.',
      });
    }
    throw error;
  }
}
