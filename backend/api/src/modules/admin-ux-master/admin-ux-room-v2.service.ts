import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { normalizePagination, v2Data, v2List } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  CreateRoomV2Dto,
  ListRoomsV2QueryDto,
  UpdateRoomV2Dto,
  UpdateRoomV2StatusDto,
} from './admin-ux-room-v2.dto';

type Row = Record<string, unknown>;

@Injectable()
export class AdminUxRoomV2Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListRoomsV2QueryDto) {
    const scope = await this.scope(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const filters = [
      scope,
      query.property_id ?? null,
      query.kost_type_id ?? null,
      query.category ?? null,
      query.building_id ?? null,
      query.floor ?? null,
      query.status ?? null,
      query.q ?? null,
    ];
    const fromAndWhere = `FROM rooms room
       JOIN kost_types kost_type ON kost_type.id = room.kost_type_id
       LEFT JOIN room_buildings building ON building.id = room.building_id
       WHERE ($1::uuid[] IS NULL OR room.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR room.property_id = $2)
         AND ($3::uuid IS NULL OR room.kost_type_id = $3)
         AND ($4::text IS NULL OR kost_type.category = $4)
         AND ($5::uuid IS NULL OR room.building_id = $5)
         AND ($6::text IS NULL OR room.floor = $6)
         AND ($7::text IS NULL OR room.room_status = $7)
         AND ($8::text IS NULL OR room.number ILIKE '%' || $8 || '%' OR room.room_code ILIKE '%' || $8 || '%')`;
    const countResult = await this.database.client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       ${fromAndWhere}`,
      filters,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    if (total === 0 || offset >= total) {
      return v2List([], limit, offset, total);
    }
    const result = await this.database.client.query<Row>(
      `SELECT
         room.id, room.property_id, room.kost_type_id, room.number, room.room_code, room.building_id,
         room.unit_code, room.gender_policy, room.floor, room.floor_code, room.floor_label, room.size_label,
         room.room_status, room.primary_photo_file_id, room.public_visible, room.created_at, room.updated_at,
         kost_type.name AS kost_type_name, kost_type.slug AS kost_type_slug, kost_type.category AS kost_type_category,
         kost_type.monthly_price, kost_type.yearly_price, kost_type.deposit_amount,
         building.building_code, building.building_name
       ${fromAndWhere}
       ORDER BY room.property_id, building.building_code NULLS LAST, room.floor_code NULLS LAST, room.room_code NULLS LAST, room.number
       LIMIT $9 OFFSET $10`,
      [...filters, limit, offset],
    );
    const records = await this.hydrate(result.rows, query.include_active_lease ?? false);
    return v2List(records, limit, offset, total);
  }

  async get(user: UserAccessContext, roomId: string, includeActiveLease = false) {
    const row = await this.requireRoom(roomId);
    await this.properties.assertCanReadProperty(user, String(row.property_id));
    const full = await this.roomById(roomId, includeActiveLease);
    return v2Data(full);
  }

  async create(user: UserAccessContext, dto: CreateRoomV2Dto, context: RequestAuditContext) {
    this.assertNoCommercialFields(dto);
    await this.assertCanMutate(user, dto.property_id);
    const kostType = await this.requireActiveKostType(dto.kost_type_id, dto.property_id);
    const building = await this.requireBuilding(dto.building_id, dto.property_id);
    this.assertBuildingMatchesType(building, kostType);
    if (dto.primary_photo_file_id)
      await this.assertPhotoFile(dto.primary_photo_file_id, dto.property_id);

    try {
      const result = await this.database.client.query<Row>(
        `INSERT INTO rooms (
           property_id, kost_type_id, number, room_code, building_id, category, unit_code, gender_policy,
           floor, floor_code, floor_label, size_label, monthly_price, yearly_price, deposit_amount,
           primary_photo_file_id, public_visible, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'mixed'), $9, $10, $11, $12, $13::integer, $14::integer,
           $15::integer, $16, COALESCE($17, true), $18, $18
         ) RETURNING id`,
        [
          dto.property_id,
          dto.kost_type_id,
          dto.number.trim(),
          dto.room_code?.trim() ?? null,
          dto.building_id,
          kostType.category,
          dto.unit_code ?? null,
          dto.gender_policy ?? null,
          dto.floor ?? null,
          dto.floor_code ?? null,
          dto.floor_label ?? null,
          dto.size_label ?? null,
          Number(kostType.monthly_price),
          Number(kostType.yearly_price),
          Number(kostType.deposit_amount),
          dto.primary_photo_file_id ?? null,
          dto.public_visible ?? null,
          user.id,
        ],
      );
      const room = await this.roomById(String(result.rows[0].id), false);
      await this.audit.write({
        actorUserId: user.id,
        propertyId: dto.property_id,
        action: 'room.create.v2',
        resourceType: 'room',
        resourceId: String(result.rows[0].id),
        afterData: room,
        resultStatus: 'success',
        ...context,
      });
      return v2Data(room);
    } catch (error) {
      this.rethrowRoomConflict(error);
    }
  }

  async update(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomV2Dto,
    context: RequestAuditContext,
  ) {
    this.assertNoCommercialFields(dto);
    const before = await this.requireRoom(roomId);
    await this.assertCanMutate(user, String(before.property_id));
    const proposedKostTypeId = dto.kost_type_id ?? String(before.kost_type_id);
    const proposedBuildingId = dto.building_id ?? String(before.building_id);
    const kostType = await this.requireActiveKostType(
      proposedKostTypeId,
      String(before.property_id),
    );
    const building = await this.requireBuilding(proposedBuildingId, String(before.property_id));
    this.assertBuildingMatchesType(building, kostType);
    if (
      dto.kost_type_id &&
      dto.kost_type_id !== before.kost_type_id &&
      before.room_status === 'occupied'
    ) {
      throw new ConflictException({
        code: 'ROOM_KOST_TYPE_CHANGE_REQUIRES_TRANSFER',
        message: 'An occupied room cannot change kost type; use transfer after lease cutover.',
      });
    }
    if (dto.primary_photo_file_id)
      await this.assertPhotoFile(dto.primary_photo_file_id, String(before.property_id));
    try {
      const result = await this.database.client.query<Row>(
        `UPDATE rooms
         SET kost_type_id = $2, number = COALESCE($3, number), room_code = COALESCE($4, room_code),
             building_id = $5, category = $6, unit_code = COALESCE($7, unit_code),
             gender_policy = COALESCE($8, gender_policy), floor = COALESCE($9, floor),
             floor_code = COALESCE($10, floor_code), floor_label = COALESCE($11, floor_label),
             size_label = COALESCE($12, size_label), primary_photo_file_id = COALESCE($13, primary_photo_file_id),
             public_visible = COALESCE($14, public_visible),
             monthly_price = $15::integer, yearly_price = $16::integer, deposit_amount = $17::integer,
             updated_by_user_id = $18, updated_at = now()
         WHERE id = $1 RETURNING id`,
        [
          roomId,
          proposedKostTypeId,
          dto.number?.trim() ?? null,
          dto.room_code?.trim() ?? null,
          proposedBuildingId,
          kostType.category,
          dto.unit_code ?? null,
          dto.gender_policy ?? null,
          dto.floor ?? null,
          dto.floor_code ?? null,
          dto.floor_label ?? null,
          dto.size_label ?? null,
          dto.primary_photo_file_id ?? null,
          dto.public_visible ?? null,
          Number(kostType.monthly_price),
          Number(kostType.yearly_price),
          Number(kostType.deposit_amount),
          user.id,
        ],
      );
      if (!result.rows[0])
        throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
      const room = await this.roomById(roomId, false);
      await this.audit.write({
        actorUserId: user.id,
        propertyId: String(before.property_id),
        action: 'room.update.v2',
        resourceType: 'room',
        resourceId: roomId,
        beforeData: this.auditRoom(before),
        afterData: room,
        resultStatus: 'success',
        ...context,
      });
      return v2Data(room);
    } catch (error) {
      this.rethrowRoomConflict(error);
    }
  }

  async updateStatus(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomV2StatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutate(user, String(before.property_id));
    if (!['maintenance', 'inactive', 'requires_review', 'vacant'].includes(dto.status)) {
      throw new UnprocessableEntityException({
        code: 'ROOM_STATUS_MANAGED_BY_LEASE',
        message: 'Occupied and reserved status cannot be set through the room endpoint.',
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

  private async roomById(roomId: string, includeActiveLease: boolean) {
    const result = await this.database.client.query<Row>(
      `SELECT
         room.id, room.property_id, room.kost_type_id, room.number, room.room_code, room.building_id,
         room.unit_code, room.gender_policy, room.floor, room.floor_code, room.floor_label, room.size_label,
         room.room_status, room.primary_photo_file_id, room.public_visible, room.created_at, room.updated_at,
         kost_type.name AS kost_type_name, kost_type.slug AS kost_type_slug, kost_type.category AS kost_type_category,
         kost_type.monthly_price, kost_type.yearly_price, kost_type.deposit_amount,
         building.building_code, building.building_name
       FROM rooms room
       JOIN kost_types kost_type ON kost_type.id = room.kost_type_id
       LEFT JOIN room_buildings building ON building.id = room.building_id
       WHERE room.id = $1`,
      [roomId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    return (await this.hydrate(result.rows, includeActiveLease))[0];
  }

  private async hydrate(rows: Row[], includeActiveLease: boolean) {
    if (!rows.length) return [];
    const typeIds = [...new Set(rows.map((row) => String(row.kost_type_id)))];
    const roomIds = rows.map((row) => String(row.id));
    const [facilities, occupancies] = await Promise.all([
      this.database.client.query<Row>(
        `SELECT assignment.kost_type_id, facility.id, facility.name, facility.icon, facility.description,
                facility.category_id, facility.sort_order
         FROM kost_type_facility_assignments assignment
         JOIN room_facilities facility ON facility.id = assignment.facility_id
         WHERE assignment.kost_type_id = ANY($1::uuid[])
         ORDER BY facility.sort_order, facility.name`,
        [typeIds],
      ),
      includeActiveLease
        ? this.database.client.query<Row>(
            `SELECT occupancy.room_id, occupancy.id, occupancy.resident_id, occupancy.start_date,
                    resident.full_name AS resident_name
             FROM occupancies occupancy
             JOIN residents resident ON resident.id = occupancy.resident_id
             WHERE occupancy.room_id = ANY($1::uuid[]) AND occupancy.occupancy_status = 'active'`,
            [roomIds],
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
    for (const occupancy of occupancies.rows) {
      occupancyByRoom.set(String(occupancy.room_id), {
        id: occupancy.id,
        resident_id: occupancy.resident_id,
        resident_name: occupancy.resident_name,
        start_date: occupancy.start_date,
      });
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

  private async requireActiveKostType(id: string, propertyId: string): Promise<Row> {
    const result = await this.database.client.query<Row>(
      `SELECT * FROM kost_types WHERE id = $1 AND property_id = $2 AND status = 'active' AND deleted_at IS NULL`,
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

  private async assertPhotoFile(fileId: string, propertyId: string): Promise<void> {
    const result = await this.database.client.query<Row>(
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

  private assertNoCommercialFields(dto: CreateRoomV2Dto | UpdateRoomV2Dto): void {
    if (
      dto.monthly_price !== undefined ||
      dto.yearly_price !== undefined ||
      dto.deposit_amount !== undefined ||
      dto.facility_ids !== undefined
    ) {
      throw new BadRequestException({
        code: 'IMMUTABLE_ROOM_COMMERCIAL_FIELD',
        message: 'Room pricing, deposit, and facilities are controlled by kost type.',
      });
    }
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
      building_id: row.building_id,
      room_status: row.room_status,
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
