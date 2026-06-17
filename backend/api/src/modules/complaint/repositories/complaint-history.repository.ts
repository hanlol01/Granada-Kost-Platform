import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { ComplaintHistoryRecord, ComplaintStatusTransitionInput, StoredComplaintStatus } from '../types/complaint.types';

type ComplaintHistoryRow = {
  id: string;
  complaint_id: string;
  from_status: StoredComplaintStatus | null;
  to_status: StoredComplaintStatus;
  label: string | null;
  changed_by_user_id: string | null;
  changed_at: Date;
  notes: string | null;
};

@Injectable()
export class ComplaintHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(complaintId: string): Promise<ComplaintHistoryRecord[]> {
    const result = await this.database.client.query<ComplaintHistoryRow>(
      `SELECT id, complaint_id, from_status, to_status, label, changed_by_user_id, changed_at, notes
       FROM complaint_status_histories
       WHERE complaint_id = $1
       ORDER BY changed_at ASC`,
      [complaintId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async record(input: ComplaintStatusTransitionInput): Promise<ComplaintHistoryRecord> {
    const result = await this.database.client.query<ComplaintHistoryRow>(
      `INSERT INTO complaint_status_histories (
         complaint_id, from_status, to_status, label, changed_by_user_id, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, complaint_id, from_status, to_status, label, changed_by_user_id, changed_at, notes`,
      [input.complaintId, input.fromStatus, input.toStatus, input.label ?? null, input.actorUserId ?? null, input.notes ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: ComplaintHistoryRow): ComplaintHistoryRecord {
    return {
      id: row.id,
      complaintId: row.complaint_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      label: row.label,
      changedByUserId: row.changed_by_user_id,
      changedAt: row.changed_at,
      notes: row.notes,
    };
  }
}
