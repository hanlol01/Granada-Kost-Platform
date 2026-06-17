import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateRoomDto } from '../dto/create-room.dto';
import { CreateRoomFacilityDto } from '../dto/create-room-facility.dto';
import { CreateRoomTypeDto } from '../dto/create-room-type.dto';
import { ListRoomsQueryDto } from '../dto/list-rooms-query.dto';
import { UpdateRoomDto } from '../dto/update-room.dto';
import { UpdateRoomTypeDto } from '../dto/update-room-type.dto';
import { RoomFacilityRecord, RoomGenderPolicy, RoomRecord, RoomStatus, RoomTypeRecord } from '../types/room.types';

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
      `SELECT id, property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price,
              deposit_amount, room_status, primary_photo_file_id
       FROM rooms
       WHERE ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR property_id = $2)
         AND ($3::text IS NULL OR room_status = $3)
         AND ($4::text IS NULL OR floor = $4)
         AND ($5::uuid IS NULL OR room_type_id = $5)
       ORDER BY property_id, floor, number`,
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
      `SELECT id, property_id, room_type_id, number, unit_code, gender_policy, floor, size_label, monthly_price,
              deposit_amount, room_status, primary_photo_file_id
       FROM rooms
       WHERE id = $1`,
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
