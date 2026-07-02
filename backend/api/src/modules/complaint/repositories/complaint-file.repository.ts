import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { ComplaintFileRecord, CreateComplaintFileInput } from '../types/complaint.types';

type QueryClient = Pool | PoolClient;

type ComplaintFileRow = {
  id: string;
  complaint_id: string;
  file_id: string;
  uploaded_by_user_id: string | null;
  caption: string | null;
  created_at: Date;
};

@Injectable()
export class ComplaintFileRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(complaintId: string): Promise<ComplaintFileRecord[]> {
    const result = await this.database.client.query<ComplaintFileRow>(
      `SELECT id, complaint_id, file_id, uploaded_by_user_id, caption, created_at
       FROM complaint_files
       WHERE complaint_id = $1
       ORDER BY created_at ASC`,
      [complaintId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async attach(input: CreateComplaintFileInput, client: QueryClient = this.database.client): Promise<ComplaintFileRecord> {
    const result = await client.query<ComplaintFileRow>(
      `INSERT INTO complaint_files (complaint_id, file_id, uploaded_by_user_id, caption)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (complaint_id, file_id) DO UPDATE
       SET caption = EXCLUDED.caption
       RETURNING id, complaint_id, file_id, uploaded_by_user_id, caption, created_at`,
      [input.complaintId, input.fileId, input.uploadedByUserId ?? null, input.caption ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: ComplaintFileRow): ComplaintFileRecord {
    return {
      id: row.id,
      complaintId: row.complaint_id,
      fileId: row.file_id,
      uploadedByUserId: row.uploaded_by_user_id,
      caption: row.caption,
      createdAt: row.created_at,
    };
  }
}
