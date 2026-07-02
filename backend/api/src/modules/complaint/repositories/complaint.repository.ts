import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  ActiveResidentComplaintContext,
  ComplaintPriority,
  ComplaintRecord,
  ComplaintSummaryRecord,
  CreateComplaintInput,
  StoredComplaintStatus,
} from '../types/complaint.types';

type QueryClient = Pool | PoolClient;

type ComplaintRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string | null;
  category_id: string;
  complaint_code: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  complaint_status: StoredComplaintStatus;
  reopen_count: number;
  response_sla_breached: boolean;
  resolution_sla_breached: boolean;
  location_note: string | null;
  assigned_to_user_id: string | null;
  submitted_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  snapshot_room_number: string | null;
  snapshot_resident_name: string;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ComplaintRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: StoredComplaintStatus, limit = 20, offset = 0): Promise<ComplaintRecord[]> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns()}
       FROM complaints
       WHERE property_id = $1
         AND ($2::text IS NULL OR complaint_status = $2)
       ORDER BY submitted_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(
    propertyIds: string[],
    status?: StoredComplaintStatus,
    limit = 20,
    offset = 0,
  ): Promise<ComplaintRecord[]> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns()}
       FROM complaints
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR complaint_status = $2)
       ORDER BY submitted_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForResident(residentId: string, limit = 20, offset = 0): Promise<ComplaintRecord[]> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns()}
       FROM complaints
       WHERE resident_id = $1
       ORDER BY submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [residentId, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForUser(userId: string, limit = 20, offset = 0): Promise<ComplaintRecord[]> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns('complaints')}
       FROM complaints
       JOIN residents ON residents.id = complaints.resident_id
       WHERE residents.user_id = $1
       ORDER BY complaints.submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<ComplaintRecord | null> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns()}
       FROM complaints
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByIdForUser(complaintId: string, userId: string): Promise<ComplaintRecord | null> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns('complaints')}
       FROM complaints
       JOIN residents ON residents.id = complaints.resident_id
       WHERE complaints.id = $1 AND residents.user_id = $2`,
      [complaintId, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async activeContextForUser(userId: string): Promise<ActiveResidentComplaintContext | null> {
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

  async create(input: CreateComplaintInput, client: QueryClient = this.database.client): Promise<ComplaintRecord> {
    const result = await client.query<ComplaintRow>(
      `INSERT INTO complaints (
         property_id, resident_id, room_id, category_id, complaint_code, title, description,
         priority, complaint_status, location_note, snapshot_room_number,
         snapshot_resident_name, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', $9, $10, $11, $12)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.residentId,
        input.roomId ?? null,
        input.categoryId,
        input.complaintCode,
        input.title,
        input.description,
        input.priority,
        input.locationNote ?? null,
        input.snapshotRoomNumber ?? null,
        input.snapshotResidentName,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async transitionStatus(
    id: string,
    status: StoredComplaintStatus,
    options: { actorUserId?: string; assignedToUserId?: string; cancelReason?: string } = {},
  ): Promise<ComplaintRecord | null> {
    const result = await this.database.client.query<ComplaintRow>(
      `UPDATE complaints
       SET complaint_status = $2,
           assigned_to_user_id = COALESCE($3, assigned_to_user_id),
           acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN COALESCE(acknowledged_at, now()) ELSE acknowledged_at END,
           resolved_at = CASE WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
           closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now()) ELSE closed_at END,
           cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
           cancel_reason = CASE WHEN $2 = 'cancelled' THEN $4 ELSE cancel_reason END,
           reopen_count = CASE WHEN $2 = 'reopened' THEN reopen_count + 1 ELSE reopen_count END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status, options.assignedToUserId ?? null, options.cancelReason ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async updateSlaFlags(id: string, responseBreached: boolean, resolutionBreached: boolean): Promise<ComplaintRecord | null> {
    const result = await this.database.client.query<ComplaintRow>(
      `UPDATE complaints
       SET response_sla_breached = $2,
           resolution_sla_breached = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, responseBreached, resolutionBreached],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async nextSequence(propertyId: string, year: number): Promise<number> {
    const result = await this.database.client.query<{ next_sequence: string }>(
      `SELECT count(*) + 1 AS next_sequence
       FROM complaints
       WHERE property_id = $1
         AND extract(year from submitted_at) = $2`,
      [propertyId, year],
    );
    return Number(result.rows[0].next_sequence);
  }

  async summaryForProperties(propertyIds: string[]): Promise<ComplaintSummaryRecord> {
    const result = await this.database.client.query<{
      open_count: string;
      closed_count: string;
      cancelled_count: string;
      sla_breached_count: string;
      total_count: string;
      avg_resolution_hours: string | null;
    }>(
      `SELECT count(*) FILTER (WHERE complaint_status NOT IN ('closed', 'cancelled')) AS open_count,
              count(*) FILTER (WHERE complaint_status = 'closed') AS closed_count,
              count(*) FILTER (WHERE complaint_status = 'cancelled') AS cancelled_count,
              count(*) FILTER (WHERE response_sla_breached = true OR resolution_sla_breached = true) AS sla_breached_count,
              count(*) AS total_count,
              avg(extract(epoch from (resolved_at - submitted_at)) / 3600)
                FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_hours
       FROM complaints
       WHERE property_id = ANY($1::uuid[])`,
      [propertyIds],
    );
    const row = result.rows[0];
    return {
      openCount: Number(row.open_count),
      closedCount: Number(row.closed_count),
      cancelledCount: Number(row.cancelled_count),
      slaBreachedCount: Number(row.sla_breached_count),
      totalCount: Number(row.total_count),
      avgResolutionHours: row.avg_resolution_hours === null ? null : Number(row.avg_resolution_hours),
    };
  }

  private columns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}property_id, ${p}resident_id, ${p}room_id, ${p}category_id, ${p}complaint_code, ${p}title, ${p}description,
            ${p}priority, ${p}complaint_status, ${p}reopen_count, ${p}response_sla_breached, ${p}resolution_sla_breached,
            ${p}location_note, ${p}assigned_to_user_id, ${p}submitted_at, ${p}acknowledged_at, ${p}resolved_at, ${p}closed_at,
            ${p}cancelled_at, ${p}cancel_reason, ${p}snapshot_room_number, ${p}snapshot_resident_name,
            ${p}created_by_user_id, ${p}created_at, ${p}updated_at`;
  }

  private map(row: ComplaintRow): ComplaintRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      roomId: row.room_id,
      categoryId: row.category_id,
      complaintCode: row.complaint_code,
      title: row.title,
      description: row.description,
      priority: row.priority,
      complaintStatus: row.complaint_status,
      reopenCount: row.reopen_count,
      responseSlaBreached: row.response_sla_breached,
      resolutionSlaBreached: row.resolution_sla_breached,
      locationNote: row.location_note,
      assignedToUserId: row.assigned_to_user_id,
      submittedAt: row.submitted_at,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
      closedAt: row.closed_at,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      snapshotRoomNumber: row.snapshot_room_number,
      snapshotResidentName: row.snapshot_resident_name,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
