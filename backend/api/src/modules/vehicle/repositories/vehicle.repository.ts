import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  ActiveResidentVehicleContext,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleRecord,
  VehicleSettingsRecord,
  VehicleSummaryRecord,
  VehicleStatus,
  VehicleType,
} from '../types/vehicle.types';

type VehicleRow = {
  id: string;
  property_id: string;
  resident_id: string;
  vehicle_code: string;
  plate_number: string;
  vehicle_type: VehicleType;
  brand: string;
  color: string;
  year: string | null;
  vehicle_status: VehicleStatus;
  notes: string | null;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  reject_reason: string | null;
  suspend_reason: string | null;
  deactivation_reason: string | null;
  deactivated_at: Date | null;
  snapshot_resident_name: string;
  snapshot_room_number: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class VehicleRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: VehicleStatus, vehicleType?: VehicleType, limit = 20, offset = 0): Promise<VehicleRecord[]> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns()}
       FROM vehicles
       WHERE property_id = $1
         AND ($2::text IS NULL OR vehicle_status = $2)
         AND ($3::text IS NULL OR vehicle_type = $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [propertyId, status ?? null, vehicleType ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(
    propertyIds: string[],
    status?: VehicleStatus,
    vehicleType?: VehicleType,
    limit = 20,
    offset = 0,
  ): Promise<VehicleRecord[]> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns()}
       FROM vehicles
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR vehicle_status = $2)
         AND ($3::text IS NULL OR vehicle_type = $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [propertyIds, status ?? null, vehicleType ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForResident(residentId: string, limit = 20, offset = 0): Promise<VehicleRecord[]> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns()}
       FROM vehicles
       WHERE resident_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [residentId, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForUser(userId: string, limit = 20, offset = 0): Promise<VehicleRecord[]> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns('vehicles')}
       FROM vehicles
       JOIN residents ON residents.id = vehicles.resident_id
       WHERE residents.user_id = $1
       ORDER BY vehicles.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<VehicleRecord | null> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns()}
       FROM vehicles
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByIdForUser(vehicleId: string, userId: string): Promise<VehicleRecord | null> {
    const result = await this.database.client.query<VehicleRow>(
      `SELECT ${this.columns('vehicles')}
       FROM vehicles
       JOIN residents ON residents.id = vehicles.resident_id
       WHERE vehicles.id = $1 AND residents.user_id = $2`,
      [vehicleId, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async activeContextForUser(userId: string): Promise<ActiveResidentVehicleContext | null> {
    const result = await this.database.client.query<{
      property_id: string;
      resident_id: string;
      room_id: string;
      room_number: string;
      resident_name: string;
    }>(
      `SELECT occupancies.property_id,
              residents.id AS resident_id,
              rooms.id AS room_id,
              rooms.number AS room_number,
              residents.full_name AS resident_name
       FROM occupancies
       JOIN residents ON residents.id = occupancies.resident_id
       JOIN rooms ON rooms.id = occupancies.room_id
       WHERE residents.user_id = $1
         AND occupancies.occupancy_status = 'active'
         AND occupancies.end_date IS NULL
       LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      propertyId: row.property_id,
      residentId: row.resident_id,
      roomId: row.room_id,
      roomNumber: row.room_number,
      residentName: row.resident_name,
    };
  }

  async settings(propertyId: string): Promise<VehicleSettingsRecord | null> {
    const result = await this.database.client.query<{
      property_id: string;
      parking_management_mode: 'unmanaged' | 'zone' | 'slot';
      max_vehicles_per_resident: number;
      parking_capacity_motorcycle: number | null;
      parking_capacity_car: number | null;
      parking_requires_approval: boolean;
    }>(
      `SELECT property_id,
              parking_management_mode,
              max_vehicles_per_resident,
              parking_capacity_motorcycle,
              parking_capacity_car,
              parking_requires_approval
       FROM property_settings
       WHERE property_id = $1`,
      [propertyId],
    );
    const row = result.rows[0];
    return row
      ? {
          propertyId: row.property_id,
          parkingManagementMode: row.parking_management_mode,
          maxVehiclesPerResident: row.max_vehicles_per_resident,
          parkingCapacityMotorcycle: row.parking_capacity_motorcycle,
          parkingCapacityCar: row.parking_capacity_car,
          parkingRequiresApproval: row.parking_requires_approval,
        }
      : null;
  }

  async activePlateExists(propertyId: string, plateNumber: string, excludedVehicleId?: string): Promise<boolean> {
    const result = await this.database.client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM vehicles
         WHERE property_id = $1
           AND plate_number = $2
           AND vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending')
           AND ($3::uuid IS NULL OR id <> $3)
       )`,
      [propertyId, plateNumber, excludedVehicleId ?? null],
    );
    return result.rows[0].exists;
  }

  async nonTerminalCountForResident(propertyId: string, residentId: string): Promise<number> {
    const result = await this.database.client.query<{ vehicle_count: string }>(
      `SELECT count(*) AS vehicle_count
       FROM vehicles
       WHERE property_id = $1
         AND resident_id = $2
         AND vehicle_status IN ('pending_approval', 'active', 'suspended', 'transfer_pending')`,
      [propertyId, residentId],
    );
    return Number(result.rows[0].vehicle_count);
  }

  async create(input: CreateVehicleInput): Promise<VehicleRecord> {
    const result = await this.database.client.query<VehicleRow>(
      `INSERT INTO vehicles (
         property_id, resident_id, vehicle_code, plate_number, vehicle_type, brand, color, year,
         vehicle_status, notes, approved_by_user_id, approved_at, snapshot_resident_name,
         snapshot_room_number, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $9 = 'active' THEN now() ELSE NULL END, $12, $13, $14)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.residentId,
        input.vehicleCode,
        input.plateNumber,
        input.vehicleType,
        input.brand,
        input.color,
        input.year ?? null,
        input.vehicleStatus,
        input.notes ?? null,
        input.approvedByUserId ?? null,
        input.snapshotResidentName,
        input.snapshotRoomNumber ?? null,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async update(id: string, input: UpdateVehicleInput): Promise<VehicleRecord | null> {
    const result = await this.database.client.query<VehicleRow>(
      `UPDATE vehicles
       SET plate_number = COALESCE($2, plate_number),
           vehicle_type = COALESCE($3, vehicle_type),
           brand = COALESCE($4, brand),
           color = COALESCE($5, color),
           year = CASE WHEN $6::boolean THEN $7 ELSE year END,
           notes = CASE WHEN $8::boolean THEN $9 ELSE notes END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [
        id,
        input.plateNumber ?? null,
        input.vehicleType ?? null,
        input.brand ?? null,
        input.color ?? null,
        Object.prototype.hasOwnProperty.call(input, 'year'),
        input.year ?? null,
        Object.prototype.hasOwnProperty.call(input, 'notes'),
        input.notes ?? null,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async transitionStatus(
    id: string,
    status: VehicleStatus,
    options: {
      actorUserId?: string;
      rejectReason?: string;
      suspendReason?: string;
      deactivationReason?: string;
    } = {},
  ): Promise<VehicleRecord | null> {
    const result = await this.database.client.query<VehicleRow>(
      `UPDATE vehicles
       SET vehicle_status = $2,
           approved_by_user_id = CASE WHEN $2 = 'active' THEN COALESCE($3, approved_by_user_id) ELSE approved_by_user_id END,
           approved_at = CASE WHEN $2 = 'active' THEN COALESCE(approved_at, now()) ELSE approved_at END,
           reject_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE reject_reason END,
           suspend_reason = CASE WHEN $2 = 'suspended' THEN $5 ELSE suspend_reason END,
           deactivation_reason = CASE WHEN $2 = 'inactive' THEN $6 ELSE deactivation_reason END,
           deactivated_at = CASE WHEN $2 = 'inactive' THEN COALESCE(deactivated_at, now()) ELSE deactivated_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [
        id,
        status,
        options.actorUserId ?? null,
        options.rejectReason ?? null,
        options.suspendReason ?? null,
        options.deactivationReason ?? null,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async nextSequence(propertyId: string, year: number): Promise<number> {
    const result = await this.database.client.query<{ next_sequence: string }>(
      `SELECT count(*) + 1 AS next_sequence
       FROM vehicles
       WHERE property_id = $1
         AND extract(year from created_at) = $2`,
      [propertyId, year],
    );
    return Number(result.rows[0].next_sequence);
  }

  async summaryForProperties(propertyIds: string[]): Promise<VehicleSummaryRecord> {
    const result = await this.database.client.query<{
      active_count: string;
      motorcycle_count: string;
      car_count: string;
      pending_count: string;
      total_registered: string;
    }>(
      `SELECT count(*) FILTER (WHERE vehicle_status = 'active') AS active_count,
              count(*) FILTER (WHERE vehicle_status = 'active' AND vehicle_type = 'motorcycle') AS motorcycle_count,
              count(*) FILTER (WHERE vehicle_status = 'active' AND vehicle_type = 'car') AS car_count,
              count(*) FILTER (WHERE vehicle_status = 'pending_approval') AS pending_count,
              count(*) AS total_registered
       FROM vehicles
       WHERE property_id = ANY($1::uuid[])`,
      [propertyIds],
    );
    const row = result.rows[0];
    return {
      activeCount: Number(row.active_count),
      motorcycleCount: Number(row.motorcycle_count),
      carCount: Number(row.car_count),
      pendingCount: Number(row.pending_count),
      totalRegistered: Number(row.total_registered),
    };
  }

  private columns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}property_id, ${p}resident_id, ${p}vehicle_code, ${p}plate_number, ${p}vehicle_type, ${p}brand, ${p}color, ${p}year,
            ${p}vehicle_status, ${p}notes, ${p}approved_by_user_id, ${p}approved_at, ${p}reject_reason, ${p}suspend_reason,
            ${p}deactivation_reason, ${p}deactivated_at, ${p}snapshot_resident_name, ${p}snapshot_room_number,
            ${p}created_by_user_id, ${p}created_at, ${p}updated_at`;
  }

  private map(row: VehicleRow): VehicleRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      vehicleCode: row.vehicle_code,
      plateNumber: row.plate_number,
      vehicleType: row.vehicle_type,
      brand: row.brand,
      color: row.color,
      year: row.year,
      vehicleStatus: row.vehicle_status,
      notes: row.notes,
      approvedByUserId: row.approved_by_user_id,
      approvedAt: row.approved_at,
      rejectReason: row.reject_reason,
      suspendReason: row.suspend_reason,
      deactivationReason: row.deactivation_reason,
      deactivatedAt: row.deactivated_at,
      snapshotResidentName: row.snapshot_resident_name,
      snapshotRoomNumber: row.snapshot_room_number,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
