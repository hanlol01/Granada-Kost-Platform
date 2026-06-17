import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateWorkOrderInput, StoredWorkOrderStatus, WorkOrderPriority, WorkOrderRecord } from '../types/maintenance.types';

type WorkOrderRow = {
  id: string;
  property_id: string;
  room_id: string | null;
  complaint_id: string | null;
  work_order_code: string;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  work_order_status: StoredWorkOrderStatus;
  assigned_to_user_id: string | null;
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  verified_at: Date | null;
  verified_by_user_id: string | null;
  rework_reason: string | null;
  cancel_reason: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class WorkOrderRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: StoredWorkOrderStatus, limit = 20, offset = 0): Promise<WorkOrderRecord[]> {
    const result = await this.database.client.query<WorkOrderRow>(
      `SELECT ${this.columns()}
       FROM maintenance_work_orders
       WHERE property_id = $1
         AND ($2::text IS NULL OR work_order_status = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listAssigned(userId: string, status?: StoredWorkOrderStatus, limit = 20, offset = 0): Promise<WorkOrderRecord[]> {
    const result = await this.database.client.query<WorkOrderRow>(
      `SELECT ${this.columns()}
       FROM maintenance_work_orders
       WHERE assigned_to_user_id = $1
         AND ($2::text IS NULL OR work_order_status = $2)
       ORDER BY scheduled_at ASC NULLS LAST, created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<WorkOrderRecord | null> {
    const result = await this.database.client.query<WorkOrderRow>(
      `SELECT ${this.columns()}
       FROM maintenance_work_orders
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByIdAssigned(id: string, userId: string): Promise<WorkOrderRecord | null> {
    const result = await this.database.client.query<WorkOrderRow>(
      `SELECT ${this.columns()}
       FROM maintenance_work_orders
       WHERE id = $1 AND assigned_to_user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateWorkOrderInput): Promise<WorkOrderRecord> {
    const result = await this.database.client.query<WorkOrderRow>(
      `INSERT INTO maintenance_work_orders (
         property_id, room_id, complaint_id, work_order_code, title, description,
         priority, work_order_status, scheduled_at, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.roomId ?? null,
        input.complaintId ?? null,
        input.workOrderCode,
        input.title,
        input.description ?? null,
        input.priority,
        input.scheduledAt ?? null,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async transitionStatus(
    id: string,
    status: StoredWorkOrderStatus,
    options: { assignedToUserId?: string; verifiedByUserId?: string; reworkReason?: string; cancelReason?: string } = {},
  ): Promise<WorkOrderRecord | null> {
    const result = await this.database.client.query<WorkOrderRow>(
      `UPDATE maintenance_work_orders
       SET work_order_status = $2,
           assigned_to_user_id = COALESCE($3, assigned_to_user_id),
           started_at = CASE WHEN $2 = 'in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
           completed_at = CASE WHEN $2 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
           verified_at = CASE WHEN $2 = 'verified' THEN COALESCE(verified_at, now()) ELSE verified_at END,
           verified_by_user_id = CASE WHEN $2 = 'verified' THEN $4 ELSE verified_by_user_id END,
           rework_reason = CASE WHEN $2 = 'rework_required' THEN $5 ELSE rework_reason END,
           cancel_reason = CASE WHEN $2 = 'cancelled' THEN $6 ELSE cancel_reason END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [
        id,
        status,
        options.assignedToUserId ?? null,
        options.verifiedByUserId ?? null,
        options.reworkReason ?? null,
        options.cancelReason ?? null,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async nextSequence(propertyId: string, year: number): Promise<number> {
    const result = await this.database.client.query<{ next_sequence: string }>(
      `SELECT count(*) + 1 AS next_sequence
       FROM maintenance_work_orders
       WHERE property_id = $1
         AND extract(year from created_at) = $2`,
      [propertyId, year],
    );
    return Number(result.rows[0].next_sequence);
  }

  private columns(): string {
    return `id, property_id, room_id, complaint_id, work_order_code, title, description,
            priority, work_order_status, assigned_to_user_id, scheduled_at, started_at,
            completed_at, verified_at, verified_by_user_id, rework_reason, cancel_reason,
            created_by_user_id, created_at, updated_at`;
  }

  private map(row: WorkOrderRow): WorkOrderRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      roomId: row.room_id,
      complaintId: row.complaint_id,
      workOrderCode: row.work_order_code,
      title: row.title,
      description: row.description,
      priority: row.priority,
      workOrderStatus: row.work_order_status,
      assignedToUserId: row.assigned_to_user_id,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      verifiedAt: row.verified_at,
      verifiedByUserId: row.verified_by_user_id,
      reworkReason: row.rework_reason,
      cancelReason: row.cancel_reason,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
