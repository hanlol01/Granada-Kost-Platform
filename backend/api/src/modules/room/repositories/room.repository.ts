import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateRoomDto } from '../dto/create-room.dto';
import { CreateRoomFacilityDto } from '../dto/create-room-facility.dto';
import { CreateRoomTypeDto } from '../dto/create-room-type.dto';
import { ListRoomsQueryDto } from '../dto/list-rooms-query.dto';
import { UpdateRoomDto } from '../dto/update-room.dto';
import { UpdateRoomTypeDto } from '../dto/update-room-type.dto';
import {
  RoomCategory,
  RoomFacilityRecord,
  RoomFloorCode,
  RoomGenderPolicy,
  PublicRoomAvailabilityFilters,
  PublicRoomAvailabilityGroupRecord,
  PublicRoomGenderPolicy,
  RoomRecord,
  RoomStatus,
  RoomTypeRecord,
} from '../types/room.types';

type RoomTypeRow = {
  id: string;
  property_id: string;
  name: string;
  base_price: number;
  default_deposit_amount: number;
  description: string | null;
  status: RoomTypeRecord['status'];
};

type FacilityRow = {
  id: string;
  property_id: string;
  name: string;
  status: RoomFacilityRecord['status'];
};

type RoomRow = {
  id: string;
  property_id: string;
  room_type_id: string | null;
  number: string;
  unit_code: string | null;
  gender_policy: RoomGenderPolicy;
  floor: string | null;
  size_label: string | null;
  monthly_price: number;
  deposit_amount: number;
  room_status: RoomStatus;
  primary_photo_file_id: string | null;
  room_code?: string | null;
  category?: RoomCategory | null;
  building_id?: string | null;
  building_code?: string | null;
  building_name?: string | null;
  floor_code?: RoomFloorCode | null;
  floor_label?: string | null;
  public_visible?: boolean;
  yearly_price?: number | null;
};

type PublicAvailabilityGroupRow = {
  property_id: string;
  category: RoomCategory;
  gender_policy: PublicRoomGenderPolicy;
  building_code: string;
  building_name: string;
  floor_code: RoomFloorCode;
  floor_label: string | null;
  available_count: string;
  price_from_monthly: number | string;
  price_from_yearly: number | string;
};

@Injectable()
export class RoomRepository {
  constructor(private readonly database: DatabaseService) {}

  async listRoomTypes(propertyIds?: string[]): Promise<RoomTypeRecord[]> {
    const result = await this.database.client.query<RoomTypeRow>(
      `SELECT id, property_id, name, base_price, default_deposit_amount, description, status
       FROM room_types
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
       ORDER BY property_id, name`,
      [propertyIds?.length ? propertyIds : null],
    );
    return result.rows.map((row) => this.mapRoomType(row));
  }

  async createRoomType(dto: CreateRoomTypeDto, actorUserId: string): Promise<RoomTypeRecord> {
    const result = await this.database.client.query<RoomTypeRow>(
      `INSERT INTO room_types (
         property_id, name, base_price, default_deposit_amount, description,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, property_id, name, base_price, default_deposit_amount, description, status`,
      [dto.property_id, dto.name, dto.base_price, dto.default_deposit_amount, dto.description ?? null, actorUserId],
    );
    return this.mapRoomType(result.rows[0]);
  }

  async updateRoomType(id: string, dto: UpdateRoomTypeDto, actorUserId: string): Promise<RoomTypeRecord | null> {
    const result = await this.database.client.query<RoomTypeRow>(
      `UPDATE room_types
       SET name = COALESCE($2, name),
           base_price = COALESCE($3, base_price),
           default_deposit_amount = COALESCE($4, default_deposit_amount),
           description = COALESCE($5, description),
           status = COALESCE($6, status),
           updated_by_user_id = $7,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, name, base_price, default_deposit_amount, description, status`,
      [
        id,
        dto.name ?? null,
        dto.base_price ?? null,
        dto.default_deposit_amount ?? null,
        dto.description ?? null,
        dto.status ?? null,
        actorUserId,
      ],
    );
    return result.rows[0] ? this.mapRoomType(result.rows[0]) : null;
  }

  async findRoomType(id: string): Promise<RoomTypeRecord | null> {
    const result = await this.database.client.query<RoomTypeRow>(
      `SELECT id, property_id, name, base_price, default_deposit_amount, description, status
       FROM room_types
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRoomType(result.rows[0]) : null;
  }

  async listFacilities(propertyIds?: string[]): Promise<RoomFacilityRecord[]> {
    const result = await this.database.client.query<FacilityRow>(
      `SELECT id, property_id, name, status
       FROM room_facilities
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
       ORDER BY property_id, name`,
      [propertyIds?.length ? propertyIds : null],
    );
    return result.rows.map((row) => this.mapFacility(row));
  }

  async createFacility(dto: CreateRoomFacilityDto, actorUserId: string): Promise<RoomFacilityRecord> {
    const result = await this.database.client.query<FacilityRow>(
      `INSERT INTO room_facilities (property_id, name, status, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, COALESCE($3, 'active'), $4, $4)
       RETURNING id, property_id, name, status`,
      [dto.property_id, dto.name, dto.status ?? null, actorUserId],
    );
    return this.mapFacility(result.rows[0]);
  }

  async listRooms(query: ListRoomsQueryDto, propertyIds?: string[]): Promise<RoomRecord[]> {
    const result = await this.database.client.query<RoomRow>(
      `SELECT rooms.id, rooms.property_id, rooms.room_type_id, rooms.number, rooms.unit_code, rooms.gender_policy,
              rooms.floor, rooms.size_label, rooms.monthly_price, rooms.deposit_amount, rooms.room_status,
              rooms.primary_photo_file_id, rooms.room_code, rooms.category, rooms.building_id,
              room_buildings.building_code, room_buildings.building_name, rooms.floor_code, rooms.floor_label,
              rooms.public_visible, rooms.yearly_price
       FROM rooms
       LEFT JOIN room_buildings ON room_buildings.id = rooms.building_id
       WHERE ($1::uuid[] IS NULL OR rooms.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR rooms.property_id = $2)
         AND ($3::text IS NULL OR rooms.room_status = $3)
         AND ($4::text IS NULL OR rooms.floor = $4)
         AND ($5::uuid IS NULL OR rooms.room_type_id = $5)
       ORDER BY rooms.property_id, rooms.category NULLS LAST, room_buildings.building_code NULLS LAST,
                rooms.floor_code NULLS LAST, rooms.room_code NULLS LAST, rooms.number`,
      [
        propertyIds?.length ? propertyIds : null,
        query.property_id ?? null,
        query.status ?? null,
        query.floor ?? null,
        query.room_type_id ?? null,
      ],
    );
    return this.hydrateRooms(result.rows);
  }

  async findRoom(id: string): Promise<RoomRecord | null> {
    const result = await this.database.client.query<RoomRow>(
      `SELECT rooms.id, rooms.property_id, rooms.room_type_id, rooms.number, rooms.unit_code, rooms.gender_policy,
              rooms.floor, rooms.size_label, rooms.monthly_price, rooms.deposit_amount, rooms.room_status,
              rooms.primary_photo_file_id, rooms.room_code, rooms.category, rooms.building_id,
              room_buildings.building_code, room_buildings.building_name, rooms.floor_code, rooms.floor_label,
              rooms.public_visible, rooms.yearly_price
       FROM rooms
       LEFT JOIN room_buildings ON room_buildings.id = rooms.building_id
       WHERE rooms.id = $1`,
      [id],
    );
    const rooms = await this.hydrateRooms(result.rows);
    return rooms[0] ?? null;
  }

  async createRoom(dto: CreateRoomDto, actorUserId: string): Promise<RoomRecord> {
    const result = await this.database.client.query<RoomRow>(
      `INSERT INTO rooms (
         property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price, deposit_amount,
         primary_photo_file_id, created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, COALESCE($5, 'mixed'), $6, $7, $8, $9, $10, $10)
       RETURNING id, property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price,
                 deposit_amount, room_status, primary_photo_file_id`,
      [
        dto.property_id,
        dto.room_type_id ?? null,
        dto.number,
        dto.unit_code ?? null,
        dto.gender_policy ?? null,
        dto.floor ?? null,
        dto.size_label ?? null,
        dto.monthly_price,
        dto.deposit_amount,
        dto.primary_photo_file_id ?? null,
        actorUserId,
      ],
    );
    await this.replaceFacilities(result.rows[0].id, dto.facility_ids ?? []);
    return (await this.findRoom(result.rows[0].id)) as RoomRecord;
  }

  async updateRoom(id: string, dto: UpdateRoomDto, actorUserId: string): Promise<RoomRecord | null> {
    const result = await this.database.client.query<RoomRow>(
      `UPDATE rooms
       SET room_type_id = COALESCE($2, room_type_id),
           number = COALESCE($3, number),
           unit_code = COALESCE($4, unit_code),
           gender_policy = COALESCE($5, gender_policy),
           floor = COALESCE($6, floor),
           size_label = COALESCE($7, size_label),
           monthly_price = COALESCE($8, monthly_price),
           deposit_amount = COALESCE($9, deposit_amount),
           primary_photo_file_id = COALESCE($10, primary_photo_file_id),
           updated_by_user_id = $11,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price,
                 deposit_amount, room_status, primary_photo_file_id`,
      [
        id,
        dto.room_type_id ?? null,
        dto.number ?? null,
        dto.unit_code ?? null,
        dto.gender_policy ?? null,
        dto.floor ?? null,
        dto.size_label ?? null,
        dto.monthly_price ?? null,
        dto.deposit_amount ?? null,
        dto.primary_photo_file_id ?? null,
        actorUserId,
      ],
    );
    if (!result.rows[0]) {
      return null;
    }
    if (dto.facility_ids) {
      await this.replaceFacilities(id, dto.facility_ids);
    }
    return this.findRoom(id);
  }

  async updateRoomStatus(id: string, status: RoomStatus, actorUserId: string): Promise<RoomRecord | null> {
    const result = await this.database.client.query<RoomRow>(
      `UPDATE rooms
       SET room_status = $2,
           updated_by_user_id = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING id, property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price,
                 deposit_amount, room_status, primary_photo_file_id`,
      [id, status, actorUserId],
    );
    if (!result.rows[0]) {
      return null;
    }
    return this.findRoom(id);
  }

  async availability(propertyId?: string): Promise<Array<{ propertyId: string; status: RoomStatus; total: number }>> {
    const result = await this.database.client.query<{ property_id: string; room_status: RoomStatus; total: string }>(
      `SELECT property_id, room_status, count(*) AS total
       FROM rooms
       WHERE ($1::uuid IS NULL OR property_id = $1)
       GROUP BY property_id, room_status
       ORDER BY property_id, room_status`,
      [propertyId ?? null],
    );
    return result.rows.map((row) => ({
      propertyId: row.property_id,
      status: row.room_status,
      total: Number(row.total),
    }));
  }

  async listPublicAvailabilityGroups(
    filters: PublicRoomAvailabilityFilters,
  ): Promise<PublicRoomAvailabilityGroupRecord[]> {
    const result = await this.database.client.query<PublicAvailabilityGroupRow>(
      `SELECT room_buildings.property_id,
              room_buildings.category,
              room_buildings.gender_policy,
              room_buildings.building_code,
              room_buildings.building_name,
              rooms.floor_code,
              COALESCE(rooms.floor_label, rooms.floor, rooms.floor_code) AS floor_label,
              count(*) AS available_count,
              min(rooms.monthly_price) AS price_from_monthly,
              min(COALESCE(rooms.yearly_price, rooms.monthly_price * 12)) AS price_from_yearly
       FROM rooms
       JOIN room_buildings ON room_buildings.id = rooms.building_id
       WHERE rooms.room_status = 'vacant'
         AND rooms.public_visible = true
         AND room_buildings.public_visible = true
         AND rooms.floor_code IS NOT NULL
         AND room_buildings.category IN ('rukost', 'apartkost')
         AND room_buildings.gender_policy IN ('male', 'female')
         AND ($1::text IS NULL OR room_buildings.gender_policy = $1)
         AND ($2::text IS NULL OR room_buildings.category = $2)
         AND ($3::text IS NULL OR room_buildings.building_code = $3)
         AND ($4::text IS NULL OR rooms.floor_code = $4)
       GROUP BY room_buildings.property_id, room_buildings.category, room_buildings.gender_policy, room_buildings.building_code,
                room_buildings.building_name, rooms.floor_code, COALESCE(rooms.floor_label, rooms.floor, rooms.floor_code)
       ORDER BY room_buildings.category, room_buildings.gender_policy, room_buildings.building_code, rooms.floor_code`,
      [
        filters.gender ?? null,
        filters.category ?? null,
        filters.buildingCode ?? null,
        filters.floorCode ?? null,
      ],
    );

    return result.rows.map((row) => ({
      propertyId: row.property_id,
      category: row.category,
      gender: row.gender_policy,
      buildingCode: row.building_code,
      buildingName: row.building_name,
      floorCode: row.floor_code,
      floorLabel: row.floor_label ?? row.floor_code,
      availableCount: Number(row.available_count),
      priceFromMonthly: Number(row.price_from_monthly),
      priceFromYearly: Number(row.price_from_yearly),
    }));
  }

  private async replaceFacilities(roomId: string, facilityIds: string[]): Promise<void> {
    await this.database.client.query('DELETE FROM room_facility_assignments WHERE room_id = $1', [roomId]);
    for (const facilityId of facilityIds) {
      await this.database.client.query(
        `INSERT INTO room_facility_assignments (room_id, facility_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roomId, facilityId],
      );
    }
  }

  private async hydrateRooms(rows: RoomRow[]): Promise<RoomRecord[]> {
    if (!rows.length) {
      return [];
    }
    const roomIds = rows.map((row) => row.id);
    const facilities = await this.database.client.query<FacilityRow & { room_id: string }>(
      `SELECT room_facility_assignments.room_id, room_facilities.id, room_facilities.property_id,
              room_facilities.name, room_facilities.status
       FROM room_facility_assignments
       JOIN room_facilities ON room_facilities.id = room_facility_assignments.facility_id
       WHERE room_facility_assignments.room_id = ANY($1::uuid[])`,
      [roomIds],
    );
    const byRoom = new Map<string, RoomFacilityRecord[]>();
    for (const row of facilities.rows) {
      const list = byRoom.get(row.room_id) ?? [];
      list.push(this.mapFacility(row));
      byRoom.set(row.room_id, list);
    }
    return rows.map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      roomTypeId: row.room_type_id,
      number: row.number,
      unitCode: row.unit_code,
      genderPolicy: row.gender_policy,
      floor: row.floor,
      sizeLabel: row.size_label,
      monthlyPrice: row.monthly_price,
      depositAmount: row.deposit_amount,
      roomStatus: row.room_status,
      primaryPhotoFileId: row.primary_photo_file_id,
      roomCode: row.room_code ?? null,
      category: row.category ?? null,
      buildingId: row.building_id ?? null,
      buildingCode: row.building_code ?? row.unit_code ?? null,
      buildingName: row.building_name ?? null,
      floorCode: row.floor_code ?? null,
      floorLabel: row.floor_label ?? row.floor ?? null,
      publicVisible: row.public_visible ?? false,
      yearlyPrice: row.yearly_price ?? null,
      facilities: byRoom.get(row.id) ?? [],
    }));
  }

  private mapRoomType(row: RoomTypeRow): RoomTypeRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      name: row.name,
      basePrice: row.base_price,
      defaultDepositAmount: row.default_deposit_amount,
      description: row.description,
      status: row.status,
    };
  }

  private mapFacility(row: FacilityRow): RoomFacilityRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      name: row.name,
      status: row.status,
    };
  }
}
