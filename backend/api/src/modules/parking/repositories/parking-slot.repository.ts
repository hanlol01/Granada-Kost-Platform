import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateParkingSlotInput,
  ParkingSlotRecord,
  ParkingSlotStatus,
  ParkingSlotType,
} from '../types/parking.types';

type ParkingSlotRow = {
  id: string;
  zone_id: string;
  slot_number: string;
  slot_type: ParkingSlotType;
  slot_status: ParkingSlotStatus;
  vehicle_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ParkingSlotRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(zoneId: string, status?: ParkingSlotStatus): Promise<ParkingSlotRecord[]> {
    const result = await this.database.client.query<ParkingSlotRow>(
      `SELECT ${this.columns()}
       FROM parking_slots
       WHERE zone_id = $1
         AND ($2::text IS NULL OR slot_status = $2)
       ORDER BY slot_number ASC`,
      [zoneId, status ?? null],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<ParkingSlotRecord | null> {
    const result = await this.database.client.query<ParkingSlotRow>(
      `SELECT ${this.columns()}
       FROM parking_slots
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateParkingSlotInput): Promise<ParkingSlotRecord> {
    const result = await this.database.client.query<ParkingSlotRow>(
      `INSERT INTO parking_slots (zone_id, slot_number, slot_type)
       VALUES ($1, $2, $3)
       RETURNING ${this.columns()}`,
      [input.zoneId, input.slotNumber, input.slotType],
    );
    return this.map(result.rows[0]);
  }

  async assign(slotId: string, vehicleId: string): Promise<ParkingSlotRecord | null> {
    const result = await this.database.client.query<ParkingSlotRow>(
      `UPDATE parking_slots
       SET vehicle_id = $2,
           slot_status = 'occupied',
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [slotId, vehicleId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async release(slotId: string): Promise<ParkingSlotRecord | null> {
    const result = await this.database.client.query<ParkingSlotRow>(
      `UPDATE parking_slots
       SET vehicle_id = NULL,
           slot_status = 'available',
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [slotId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async countOccupied(zoneId: string): Promise<number> {
    const result = await this.database.client.query<{ occupied_count: string }>(
      `SELECT count(*) AS occupied_count
       FROM parking_slots
       WHERE zone_id = $1
         AND slot_status = 'occupied'`,
      [zoneId],
    );
    return Number(result.rows[0].occupied_count);
  }

  async countByZone(zoneId: string): Promise<number> {
    const result = await this.database.client.query<{ slot_count: string }>(
      `SELECT count(*) AS slot_count
       FROM parking_slots
       WHERE zone_id = $1`,
      [zoneId],
    );
    return Number(result.rows[0].slot_count);
  }

  private columns(): string {
    return `id, zone_id, slot_number, slot_type, slot_status, vehicle_id, created_at, updated_at`;
  }

  private map(row: ParkingSlotRow): ParkingSlotRecord {
    return {
      id: row.id,
      zoneId: row.zone_id,
      slotNumber: row.slot_number,
      slotType: row.slot_type,
      slotStatus: row.slot_status,
      vehicleId: row.vehicle_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
