import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  AdminBookingLeadRoom,
  BookingLeadCategory,
  BookingLeadFloorCode,
  BookingLeadGender,
  BookingLeadRecord,
  BookingLeadSource,
  BookingLeadStatus,
  CreateAdminBookingLeadInput,
  CreateBookingLeadInput,
  ListBookingLeadsFilters,
  PublicPropertyResolutionInput,
} from '../types/booking-lead.types';

type BookingLeadRow = {
  id: string;
  property_id: string;
  room_id: string | null;
  room_number?: string | null;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  building_code: string | null;
  floor_code: BookingLeadFloorCode | null;
  public_group_key: string | null;
  visitor_name: string;
  visitor_email: string | null;
  consent_at: Date | null;
  visitor_phone: string;
  visitor_address: string | null;
  visitor_university: string | null;
  visitor_message: string | null;
  preferred_move_in_date: string | Date | null;
  status: BookingLeadStatus;
  source: BookingLeadSource;
  metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type AdminBookingLeadRoomRow = {
  id: string;
  property_id: string;
  room_number: string;
  category: BookingLeadCategory | null;
  floor_code: BookingLeadFloorCode | null;
  room_status: string;
  gender_policy: string;
  building_id: string | null;
  building_code: string | null;
  building_category: BookingLeadCategory | null;
  building_gender_policy: string | null;
};

@Injectable()
export class BookingLeadRepository {
  constructor(private readonly database: DatabaseService) {}

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async lockPublicCreation(
    client: PoolClient,
    input: {
      propertyId: string;
      category: BookingLeadCategory;
      gender: BookingLeadGender;
      visitorPhone: string;
      idempotencyKey?: string;
    },
  ): Promise<void> {
    const lockKeys = [
      `public-lead-duplicate:${input.propertyId}:${input.category}:${input.gender}:${input.visitorPhone}`,
      ...(input.idempotencyKey
        ? [`public-lead-idempotency:${input.propertyId}:${input.idempotencyKey}`]
        : []),
    ].sort();
    for (const lockKey of lockKeys) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
    }
  }

  async findAdminRoom(propertyId: string, roomId: string): Promise<AdminBookingLeadRoom | null> {
    const result = await this.database.client.query<AdminBookingLeadRoomRow>(
      `SELECT rooms.id,
              rooms.property_id,
              rooms.number AS room_number,
              rooms.category,
              rooms.floor_code,
              rooms.room_status,
              rooms.gender_policy,
              rooms.building_id,
              room_buildings.building_code,
              room_buildings.category AS building_category,
              room_buildings.gender_policy AS building_gender_policy
       FROM rooms
       LEFT JOIN room_buildings
         ON room_buildings.id = rooms.building_id
        AND room_buildings.property_id = rooms.property_id
       WHERE rooms.id = $1
         AND rooms.property_id = $2`,
      [roomId, propertyId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      propertyId: row.property_id,
      roomNumber: row.room_number,
      category: row.category,
      floorCode: row.floor_code,
      roomStatus: row.room_status,
      genderPolicy: row.gender_policy,
      buildingId: row.building_id,
      buildingCode: row.building_code,
      buildingCategory: row.building_category,
      buildingGenderPolicy: row.building_gender_policy,
    };
  }

  async resolvePublicPropertyId(
    input: PublicPropertyResolutionInput,
    client?: PoolClient,
  ): Promise<string | null> {
    const matched = await (client ?? this.database.client).query<{ property_id: string }>(
      `SELECT DISTINCT room_buildings.property_id
       FROM room_buildings
       JOIN properties ON properties.id = room_buildings.property_id
       JOIN kost_types
         ON kost_types.property_id = room_buildings.property_id
        AND kost_types.category = room_buildings.category
        AND kost_types.status = 'active'
        AND kost_types.deleted_at IS NULL
       WHERE properties.status = 'active'
         AND room_buildings.public_visible = true
         AND room_buildings.category = $1
         AND room_buildings.gender_policy = $2
         AND EXISTS (
           SELECT 1
           FROM kost_type_content_versions content_version
           WHERE content_version.kost_type_id = kost_types.id
             AND content_version.property_id = room_buildings.property_id
             AND content_version.content_type = 'facilities'
             AND content_version.publication_status = 'published'
             AND content_version.effective_date
                 <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         )
         AND EXISTS (
           SELECT 1
           FROM property_policy_documents policy
           WHERE policy.property_id = room_buildings.property_id
             AND policy.document_type = 'public_terms'
             AND policy.publication_status = 'published'
             AND policy.effective_date
                 <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
             AND policy.public_content->'category_applicability' ? room_buildings.category
         )
       ORDER BY room_buildings.property_id
       LIMIT 2`,
      [input.category, input.gender],
    );

    if (matched.rows.length === 1 && matched.rows[0]) {
      return matched.rows[0].property_id;
    }

    return null;
  }

  async findRecentDuplicate(
    input: Pick<
      CreateBookingLeadInput,
      'propertyId' | 'category' | 'gender' | 'visitorPhone' | 'publicGroupKey'
    >,
    windowMinutes: number,
    client?: PoolClient,
  ): Promise<BookingLeadRecord | null> {
    const result = await (client ?? this.database.client).query<BookingLeadRow>(
      `SELECT ${this.columns()}
       FROM booking_leads
       WHERE property_id = $1
         AND visitor_phone = $2
         AND category = $3
         AND gender = $4
         AND COALESCE(public_group_key, '') = COALESCE($5::text, '')
         AND source = 'public_kamar'
         AND created_at >= now() - ($6::int * interval '1 minute')
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        input.propertyId,
        input.visitorPhone,
        input.category,
        input.gender,
        input.publicGroupKey ?? null,
        windowMinutes,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByPublicIdempotencyKey(
    propertyId: string,
    key: string,
    client?: PoolClient,
  ): Promise<BookingLeadRecord | null> {
    const result = await (client ?? this.database.client).query<BookingLeadRow>(
      `SELECT ${this.columns()}
       FROM booking_leads
       WHERE property_id = $1
         AND source = 'public_kamar'
         AND metadata->>'idempotencyKey' = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [propertyId, key],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateBookingLeadInput, client?: PoolClient): Promise<BookingLeadRecord> {
    const result = await (client ?? this.database.client).query<BookingLeadRow>(
      `INSERT INTO booking_leads (
         property_id, category, gender, building_code, floor_code, public_group_key,
         visitor_name, visitor_email, visitor_phone, visitor_message, visitor_university,
         preferred_move_in_date, consent_at, consent_version, source, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date,
              CASE WHEN $13 THEN now() ELSE NULL END,
              CASE WHEN $13 THEN 'public-lead-v1' ELSE NULL END, $14, $15::jsonb)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.category,
        input.gender,
        input.buildingCode ?? null,
        input.floorCode ?? null,
        input.publicGroupKey ?? null,
        input.visitorName,
        input.visitorEmail,
        input.visitorPhone,
        input.visitorMessage ?? null,
        input.visitorUniversity ?? null,
        input.preferredMoveInDate ?? null,
        input.consent === true,
        input.source,
        JSON.stringify({ ...(input.metadata ?? {}), consent: input.consent }),
      ],
    );
    return this.map(result.rows[0]);
  }

  async writePublicCreatedEvent(
    client: PoolClient,
    input: {
      lead: BookingLeadRecord;
      correlationId?: string;
    },
  ): Promise<void> {
    const safeEvidence = {
      schema_version: 1,
      status: input.lead.status,
      category: input.lead.category,
      gender: input.lead.gender,
      source: input.lead.source,
    };
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload_version, payload, correlation_id, actor_user_id, event_status
       )
       VALUES ($1, $2, 'booking_lead.created_public', 'booking_lead', $3,
               1, $4::jsonb, $5, NULL, 'pending')
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.lead.propertyId,
        `booking_lead.created_public:${input.lead.id}`,
        input.lead.id,
        JSON.stringify(safeEvidence),
        input.correlationId ?? null,
      ],
    );
  }

  async findOrCreateAdminLead(
    input: CreateAdminBookingLeadInput,
    windowMinutes: number,
  ): Promise<{ lead: BookingLeadRecord; created: boolean }> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${input.propertyId}:${input.roomId}:${input.visitorPhone}`,
      ]);

      const duplicate = await client.query<BookingLeadRow>(
        `SELECT ${this.columns()}
         FROM booking_leads
         WHERE property_id = $1
           AND room_id = $2
           AND visitor_phone = $3
           AND source = 'admin_quick_entry'
           AND created_at >= now() - ($4::int * interval '1 minute')
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.propertyId, input.roomId, input.visitorPhone, windowMinutes],
      );
      if (duplicate.rows[0]) {
        await client.query('COMMIT');
        return { lead: this.map(duplicate.rows[0]), created: false };
      }

      const inserted = await client.query<BookingLeadRow>(
        `INSERT INTO booking_leads (
           property_id, room_id, category, gender, building_code, floor_code,
           visitor_name, visitor_phone, visitor_address, visitor_university,
           status, source, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', 'admin_quick_entry', $11)
         RETURNING ${this.columns()}`,
        [
          input.propertyId,
          input.roomId,
          input.category,
          input.gender,
          input.buildingCode,
          input.floorCode,
          input.visitorName,
          input.visitorPhone,
          input.visitorAddress,
          input.visitorUniversity ?? null,
          input.createdByUserId,
        ],
      );
      await client.query('COMMIT');
      return { lead: this.map(inserted.rows[0]), created: true };
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listForProperties(
    propertyIds: string[],
    filters: ListBookingLeadsFilters,
  ): Promise<BookingLeadRecord[]> {
    if (!propertyIds.length) {
      return [];
    }

    const search = filters.search?.trim() || null;
    const phoneSearch = search?.replace(/\D/g, '') || null;
    const result = await this.database.client.query<BookingLeadRow>(
      `SELECT ${this.columns('booking_leads')},
              rooms.number AS room_number
       FROM booking_leads
       LEFT JOIN rooms ON rooms.id = booking_leads.room_id
       WHERE booking_leads.property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR booking_leads.status = $2)
         AND ($3::text IS NULL OR booking_leads.category = $3)
         AND ($4::text IS NULL OR booking_leads.gender = $4)
         AND ($5::date IS NULL OR booking_leads.created_at::date >= $5::date)
         AND ($6::date IS NULL OR booking_leads.created_at::date <= $6::date)
         AND (
           $7::text IS NULL
           OR booking_leads.visitor_name ILIKE '%' || $7 || '%'
           OR ($8::text IS NOT NULL AND booking_leads.visitor_phone ILIKE '%' || $8 || '%')
         )
       ORDER BY booking_leads.created_at DESC
       LIMIT $9 OFFSET $10`,
      [
        propertyIds,
        filters.status ?? null,
        filters.category ?? null,
        filters.gender ?? null,
        filters.dateFrom ?? null,
        filters.dateTo ?? null,
        search,
        phoneSearch,
        filters.limit ?? 20,
        filters.offset ?? 0,
      ],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<BookingLeadRecord | null> {
    const result = await this.database.client.query<BookingLeadRow>(
      `SELECT ${this.columns('booking_leads')},
              rooms.number AS room_number
       FROM booking_leads
       LEFT JOIN rooms ON rooms.id = booking_leads.room_id
       WHERE booking_leads.id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: BookingLeadStatus): Promise<BookingLeadRecord | null> {
    const result = await this.database.client.query<BookingLeadRow>(
      `WITH updated AS (
         UPDATE booking_leads
         SET status = $2,
             updated_at = now()
         WHERE id = $1
         RETURNING ${this.columns()}
       )
       SELECT ${this.columns('updated')},
              rooms.number AS room_number
       FROM updated
       LEFT JOIN rooms ON rooms.id = updated.room_id`,
      [id, status],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(tableAlias?: string): string {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `${prefix}id, ${prefix}property_id, ${prefix}room_id, ${prefix}category, ${prefix}gender,
            ${prefix}building_code, ${prefix}floor_code, ${prefix}public_group_key,
            ${prefix}visitor_name, ${prefix}visitor_email, ${prefix}visitor_phone, ${prefix}visitor_address,
            ${prefix}visitor_university, ${prefix}visitor_message, ${prefix}preferred_move_in_date,
            ${prefix}consent_at,
            ${prefix}status, ${prefix}source, ${prefix}metadata, ${prefix}created_by_user_id,
            ${prefix}created_at, ${prefix}updated_at`;
  }

  private map(row: BookingLeadRow): BookingLeadRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      roomId: row.room_id,
      roomNumber: row.room_number ?? null,
      category: row.category,
      gender: row.gender,
      buildingCode: row.building_code,
      floorCode: row.floor_code,
      publicGroupKey: row.public_group_key,
      visitorName: row.visitor_name,
      visitorEmail: row.visitor_email,
      visitorPhone: row.visitor_phone,
      visitorAddress: row.visitor_address,
      visitorUniversity: row.visitor_university,
      visitorMessage: row.visitor_message,
      preferredMoveInDate: this.dateOnly(row.preferred_move_in_date),
      status: row.status,
      source: row.source,
      metadata: row.metadata,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private dateOnly(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
    return value.slice(0, 10);
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
  }
}
