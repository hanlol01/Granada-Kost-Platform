import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import type { ParkingAssignmentHistoryRecord } from '../types/parking.types';

type HistoryRow = {
  id: string;
  property_id: string;
  slot_id: string;
  vehicle_id: string;
  action: 'assigned' | 'released';
  reason: string | null;
  actor_user_id: string | null;
  effective_at: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
};

@Injectable()
export class ParkingAssignmentHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async record(
    input: Omit<ParkingAssignmentHistoryRecord, 'id' | 'effectiveAt' | 'createdAt'>,
    client?: PoolClient,
  ): Promise<ParkingAssignmentHistoryRecord> {
    const result = await (client ?? this.database.client).query<HistoryRow>(
      `INSERT INTO parking_assignment_histories
       (property_id, slot_id, vehicle_id, action, reason, actor_user_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id, property_id, slot_id, vehicle_id, action, reason, actor_user_id,
                 effective_at, metadata, created_at`,
      [
        input.propertyId,
        input.slotId,
        input.vehicleId,
        input.action,
        input.reason,
        input.actorUserId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return this.map(result.rows[0]);
  }

  async listForSlot(slotId: string): Promise<ParkingAssignmentHistoryRecord[]> {
    const result = await this.database.client.query<HistoryRow>(
      `SELECT id, property_id, slot_id, vehicle_id, action, reason, actor_user_id,
              effective_at, metadata, created_at
       FROM parking_assignment_histories
       WHERE slot_id = $1
       ORDER BY effective_at ASC, created_at ASC`,
      [slotId],
    );
    return result.rows.map((row) => this.map(row));
  }

  private map(row: HistoryRow): ParkingAssignmentHistoryRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      slotId: row.slot_id,
      vehicleId: row.vehicle_id,
      action: row.action,
      reason: row.reason,
      actorUserId: row.actor_user_id,
      effectiveAt: row.effective_at,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}
