import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { VehicleStatus, VehicleStatusHistoryRecord, VehicleStatusTransitionInput } from '../types/vehicle.types';

type VehicleStatusHistoryRow = {
  id: string;
  vehicle_id: string;
  from_status: VehicleStatus | null;
  to_status: VehicleStatus;
  changed_by_user_id: string | null;
  changed_at: Date;
  notes: string | null;
};

@Injectable()
export class VehicleStatusHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async record(input: VehicleStatusTransitionInput): Promise<VehicleStatusHistoryRecord> {
    const result = await this.database.client.query<VehicleStatusHistoryRow>(
      `INSERT INTO vehicle_status_histories (vehicle_id, from_status, to_status, changed_by_user_id, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, vehicle_id, from_status, to_status, changed_by_user_id, changed_at, notes`,
      [input.vehicleId, input.fromStatus, input.toStatus, input.actorUserId ?? null, input.notes ?? null],
    );
    return this.map(result.rows[0]);
  }

  async list(vehicleId: string): Promise<VehicleStatusHistoryRecord[]> {
    const result = await this.database.client.query<VehicleStatusHistoryRow>(
      `SELECT id, vehicle_id, from_status, to_status, changed_by_user_id, changed_at, notes
       FROM vehicle_status_histories
       WHERE vehicle_id = $1
       ORDER BY changed_at ASC`,
      [vehicleId],
    );
    return result.rows.map((row) => this.map(row));
  }

  private map(row: VehicleStatusHistoryRow): VehicleStatusHistoryRecord {
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedByUserId: row.changed_by_user_id,
      changedAt: row.changed_at,
      notes: row.notes,
    };
  }
}
