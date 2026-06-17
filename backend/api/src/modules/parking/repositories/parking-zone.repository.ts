import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateParkingZoneInput, ParkingZoneRecord, ParkingZoneType } from '../types/parking.types';

type ParkingZoneRow = {
  id: string;
  property_id: string;
  zone_code: string;
  zone_name: string;
  zone_type: ParkingZoneType;
  capacity: number;
  location_description: string | null;
  is_active: boolean;
  sort_order: number;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ParkingZoneRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, activeOnly = true): Promise<ParkingZoneRecord[]> {
    const result = await this.database.client.query<ParkingZoneRow>(
      `SELECT ${this.columns()}
       FROM parking_zones
       WHERE property_id = $1
         AND ($2::boolean = false OR is_active = true)
       ORDER BY sort_order ASC, zone_code ASC`,
      [propertyId, activeOnly],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<ParkingZoneRecord | null> {
    const result = await this.database.client.query<ParkingZoneRow>(
      `SELECT ${this.columns()}
       FROM parking_zones
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateParkingZoneInput): Promise<ParkingZoneRecord> {
    const result = await this.database.client.query<ParkingZoneRow>(
      `INSERT INTO parking_zones (
         property_id, zone_code, zone_name, zone_type, capacity,
         location_description, sort_order, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.zoneCode,
        input.zoneName,
        input.zoneType,
        input.capacity ?? 0,
        input.locationDescription ?? null,
        input.sortOrder ?? 0,
        input.createdByUserId ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async countActiveVehicles(propertyId: string, zoneType: ParkingZoneType): Promise<number> {
    const result = await this.database.client.query<{ vehicle_count: string }>(
      `SELECT count(*) AS vehicle_count
       FROM vehicles
       WHERE property_id = $1
         AND vehicle_status = 'active'
         AND ($2 = 'mixed' OR vehicle_type = $2)`,
      [propertyId, zoneType],
    );
    return Number(result.rows[0].vehicle_count);
  }

  private columns(): string {
    return `id, property_id, zone_code, zone_name, zone_type, capacity, location_description,
            is_active, sort_order, created_by_user_id, created_at, updated_at`;
  }

  private map(row: ParkingZoneRow): ParkingZoneRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      zoneCode: row.zone_code,
      zoneName: row.zone_name,
      zoneType: row.zone_type,
      capacity: row.capacity,
      locationDescription: row.location_description,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
