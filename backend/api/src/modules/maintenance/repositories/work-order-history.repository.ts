import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { StoredWorkOrderStatus, WorkOrderHistoryRecord, WorkOrderStatusTransitionInput } from '../types/maintenance.types';

type WorkOrderHistoryRow = {
  id: string;
  work_order_id: string;
  from_status: StoredWorkOrderStatus | null;
  to_status: StoredWorkOrderStatus;
  changed_by_user_id: string | null;
  changed_at: Date;
  notes: string | null;
};

@Injectable()
export class WorkOrderHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(workOrderId: string): Promise<WorkOrderHistoryRecord[]> {
    const result = await this.database.client.query<WorkOrderHistoryRow>(
      `SELECT id, work_order_id, from_status, to_status, changed_by_user_id, changed_at, notes
       FROM maintenance_work_order_histories
       WHERE work_order_id = $1
       ORDER BY changed_at ASC`,
      [workOrderId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async record(input: WorkOrderStatusTransitionInput): Promise<WorkOrderHistoryRecord> {
    const result = await this.database.client.query<WorkOrderHistoryRow>(
      `INSERT INTO maintenance_work_order_histories (
         work_order_id, from_status, to_status, changed_by_user_id, notes
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, work_order_id, from_status, to_status, changed_by_user_id, changed_at, notes`,
      [input.workOrderId, input.fromStatus, input.toStatus, input.actorUserId ?? null, input.notes ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: WorkOrderHistoryRow): WorkOrderHistoryRecord {
    return {
      id: row.id,
      workOrderId: row.work_order_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedByUserId: row.changed_by_user_id,
      changedAt: row.changed_at,
      notes: row.notes,
    };
  }
}
