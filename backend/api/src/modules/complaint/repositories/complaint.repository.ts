import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { residentPropertyMembershipSql } from '../../resident/repositories/resident.repository';
import {
  ActiveResidentComplaintContext,
  ComplaintListFilters,
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

const STATUS_GROUPS: Record<NonNullable<ComplaintListFilters['statusGroup']>, string[]> = {
  waiting: ['submitted', 'acknowledged'],
  in_progress: ['in_progress', 'on_hold', 'escalated', 'reopened'],
  resolved: ['resolved'],
  closed: ['closed', 'cancelled'],
};

const SLA_DEADLINE_SQL = `CASE
  WHEN complaints.acknowledged_at IS NULL THEN complaints.submitted_at +
    (CASE complaints.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 4 WHEN 'medium' THEN 8 ELSE 24 END) * interval '1 hour'
  ELSE complaints.acknowledged_at +
    (CASE complaints.priority WHEN 'urgent' THEN 24 WHEN 'high' THEN 48 WHEN 'medium' THEN 120 ELSE 240 END) * interval '1 hour'
END`;

const SLA_BREACHED_SQL = `(complaints.response_sla_breached = true OR complaints.resolution_sla_breached = true OR
  (complaints.complaint_status NOT IN ('resolved', 'closed', 'cancelled') AND now() > ${SLA_DEADLINE_SQL}))`;

const SLA_AT_RISK_SQL = `(complaints.complaint_status NOT IN ('resolved', 'closed', 'cancelled') AND
  complaints.response_sla_breached = false AND complaints.resolution_sla_breached = false AND
  now() BETWEEN ${SLA_DEADLINE_SQL} -
    (CASE WHEN complaints.acknowledged_at IS NULL
      THEN (CASE complaints.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 4 WHEN 'medium' THEN 8 ELSE 24 END)
      ELSE (CASE complaints.priority WHEN 'urgent' THEN 24 WHEN 'high' THEN 48 WHEN 'medium' THEN 120 ELSE 240 END)
    END) * interval '15 minutes'
    AND ${SLA_DEADLINE_SQL})`;

const PRIORITY_ORDER_SQL = `CASE complaints.priority
  WHEN 'urgent' THEN 4
  WHEN 'high' THEN 3
  WHEN 'medium' THEN 2
  ELSE 1
END DESC`;

@Injectable()
export class ComplaintRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, filters: ComplaintListFilters = {}): Promise<ComplaintRecord[]> {
    const result = await this.database.client.query<ComplaintRow>(
      ...this.listQuery([propertyId], filters),
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(
    propertyIds: string[],
    filters: ComplaintListFilters = {},
  ): Promise<ComplaintRecord[]> {
    if (propertyIds.length === 0) return [];
    const result = await this.database.client.query<ComplaintRow>(
      ...this.listQuery(propertyIds, filters),
    );
    return result.rows.map((row) => this.map(row));
  }

  private listQuery(propertyIds: string[], filters: ComplaintListFilters): [string, unknown[]] {
    const values: unknown[] = [propertyIds];
    const predicates = ['complaints.property_id = ANY($1::uuid[])'];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (filters.status) predicates.push(`complaints.complaint_status = ${add(filters.status)}`);
    if (filters.statusGroup) {
      predicates.push(
        `complaints.complaint_status = ANY(${add(STATUS_GROUPS[filters.statusGroup])}::text[])`,
      );
    }
    if (filters.residentId)
      predicates.push(`complaints.resident_id = ${add(filters.residentId)}::uuid`);
    if (filters.priority) predicates.push(`complaints.priority = ${add(filters.priority)}`);
    if (filters.categoryId)
      predicates.push(`complaints.category_id = ${add(filters.categoryId)}::uuid`);
    if (filters.assignment === 'assigned')
      predicates.push('complaints.assigned_to_user_id IS NOT NULL');
    if (filters.assignment === 'unassigned')
      predicates.push('complaints.assigned_to_user_id IS NULL');
    if (filters.buildingId)
      predicates.push(`room_filter.building_id = ${add(filters.buildingId)}::uuid`);
    if (filters.roomId) predicates.push(`complaints.room_id = ${add(filters.roomId)}::uuid`);
    if (filters.from)
      predicates.push(`complaints.submitted_at >= ${add(filters.from)}::timestamptz`);
    if (filters.to)
      predicates.push(`complaints.submitted_at < (${add(filters.to)}::date + interval '1 day')`);
    if (filters.q?.trim()) {
      const term = `%${filters.q.trim()}%`;
      const parameter = add(term);
      predicates.push(`(
        complaints.complaint_code ILIKE ${parameter} OR complaints.title ILIKE ${parameter} OR
        complaints.description ILIKE ${parameter} OR complaints.snapshot_resident_name ILIKE ${parameter} OR
        complaints.snapshot_room_number ILIKE ${parameter} OR complaints.location_note ILIKE ${parameter} OR
        category_filter.name ILIKE ${parameter} OR category_filter.normalized_code ILIKE ${parameter} OR
        room_filter.number ILIKE ${parameter} OR room_filter.room_code ILIKE ${parameter} OR
        building_filter.building_code ILIKE ${parameter} OR building_filter.building_name ILIKE ${parameter}
      )`);
    }
    if (filters.sla === 'breached') predicates.push(SLA_BREACHED_SQL);
    if (filters.sla === 'at_risk') predicates.push(SLA_AT_RISK_SQL);
    if (filters.sla === 'on_track')
      predicates.push(`NOT ${SLA_BREACHED_SQL} AND NOT ${SLA_AT_RISK_SQL}`);

    const orderBy =
      filters.sort === 'oldest'
        ? 'complaints.submitted_at ASC, complaints.id ASC'
        : filters.sort === 'priority'
          ? `${PRIORITY_ORDER_SQL}, complaints.submitted_at DESC, complaints.id DESC`
          : filters.sort === 'sla'
            ? `${SLA_BREACHED_SQL} DESC, ${SLA_AT_RISK_SQL} DESC, complaints.submitted_at ASC, complaints.id ASC`
            : 'complaints.submitted_at DESC, complaints.id DESC';
    const limit = add(filters.limit ?? 20);
    const offset = add(filters.offset ?? 0);
    const sql = `SELECT ${this.columns('complaints')}
      FROM complaints
      LEFT JOIN rooms room_filter ON room_filter.id = complaints.room_id
        AND room_filter.property_id = complaints.property_id
      LEFT JOIN room_buildings building_filter ON building_filter.id = room_filter.building_id
      LEFT JOIN complaint_categories category_filter ON category_filter.id = complaints.category_id
        AND category_filter.property_id = complaints.property_id
      WHERE ${predicates.join('\n        AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`;
    return [sql, values];
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
         AND complaints.property_id = residents.property_id
         AND ${residentPropertyMembershipSql('$1')}
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

  async findByIdForUpdate(id: string, client: PoolClient): Promise<ComplaintRecord | null> {
    const result = await client.query<ComplaintRow>(
      `SELECT ${this.columns()}
       FROM complaints
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByIdForUser(complaintId: string, userId: string): Promise<ComplaintRecord | null> {
    const result = await this.database.client.query<ComplaintRow>(
      `SELECT ${this.columns('complaints')}
       FROM complaints
       JOIN residents ON residents.id = complaints.resident_id
       WHERE complaints.id = $1
         AND residents.user_id = $2
         AND complaints.property_id = residents.property_id
         AND ${residentPropertyMembershipSql('$2')}`,
      [complaintId, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async activeContextsForUser(userId: string): Promise<ActiveResidentComplaintContext[]> {
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
         AND residents.resident_status = 'active'
         AND occupancies.occupancy_status = 'active'
         AND occupancies.end_date IS NULL
         AND occupancies.property_id = residents.property_id
         AND rooms.property_id = residents.property_id
         AND ${residentPropertyMembershipSql('$1')}
       ORDER BY occupancies.start_date DESC, occupancies.id ASC
       LIMIT 2`,
      [userId],
    );
    return result.rows.map((row) => ({
      propertyId: row.property_id,
      residentId: row.resident_id,
      roomId: row.room_id,
      roomNumber: row.room_number,
      residentName: row.resident_name,
    }));
  }

  async create(
    input: CreateComplaintInput,
    client: QueryClient = this.database.client,
  ): Promise<ComplaintRecord> {
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
    client: QueryClient = this.database.client,
  ): Promise<ComplaintRecord | null> {
    const result = await client.query<ComplaintRow>(
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

  async assignForDispatch(
    id: string,
    assignedToUserId: string,
    client: PoolClient,
  ): Promise<ComplaintRecord | null> {
    const result = await client.query<ComplaintRow>(
      `UPDATE complaints
       SET complaint_status = CASE
             WHEN complaint_status IN ('submitted', 'acknowledged', 'reopened')
               THEN 'in_progress'
             ELSE complaint_status
           END,
           assigned_to_user_id = $2,
           updated_at = now()
       WHERE id = $1
         AND complaint_status IN (
           'submitted', 'acknowledged', 'in_progress', 'on_hold', 'escalated', 'reopened'
         )
       RETURNING ${this.columns()}`,
      [id, assignedToUserId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async updateSlaFlags(
    id: string,
    responseBreached: boolean,
    resolutionBreached: boolean,
  ): Promise<ComplaintRecord | null> {
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
      avgResolutionHours:
        row.avg_resolution_hours === null ? null : Number(row.avg_resolution_hours),
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
