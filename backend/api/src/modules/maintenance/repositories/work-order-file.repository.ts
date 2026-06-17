import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateWorkOrderFileInput, WorkOrderFileRecord } from '../types/maintenance.types';

type WorkOrderFileRow = {
  id: string;
  work_order_id: string;
  file_id: string;
  uploaded_by_user_id: string | null;
  caption: string | null;
  created_at: Date;
};

@Injectable()
export class WorkOrderFileRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(workOrderId: string): Promise<WorkOrderFileRecord[]> {
    const result = await this.database.client.query<WorkOrderFileRow>(
      `SELECT id, work_order_id, file_id, uploaded_by_user_id, caption, created_at
       FROM maintenance_work_order_files
       WHERE work_order_id = $1
       ORDER BY created_at ASC`,
      [workOrderId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async attach(input: CreateWorkOrderFileInput): Promise<WorkOrderFileRecord> {
    const result = await this.database.client.query<WorkOrderFileRow>(
      `INSERT INTO maintenance_work_order_files (work_order_id, file_id, uploaded_by_user_id, caption)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (work_order_id, file_id) DO UPDATE
       SET caption = EXCLUDED.caption
       RETURNING id, work_order_id, file_id, uploaded_by_user_id, caption, created_at`,
      [input.workOrderId, input.fileId, input.uploadedByUserId ?? null, input.caption ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: WorkOrderFileRow): WorkOrderFileRecord {
    return {
      id: row.id,
      workOrderId: row.work_order_id,
      fileId: row.file_id,
      uploadedByUserId: row.uploaded_by_user_id,
      caption: row.caption,
      createdAt: row.created_at,
    };
  }
}
