import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  BookingLeadCategory,
  BookingLeadFloorCode,
  BookingLeadGender,
  BookingLeadRecord,
  BookingLeadSource,
  BookingLeadStatus,
  CreateBookingLeadInput,
  ListBookingLeadsFilters,
  PublicPropertyResolutionInput,
} from '../types/booking-lead.types';

type BookingLeadRow = {
  id: string;
  property_id: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  building_code: string | null;
  floor_code: BookingLeadFloorCode | null;
  public_group_key: string | null;
  visitor_name: string;
  visitor_phone: string;
  visitor_message: string | null;
  preferred_move_in_date: string | Date | null;
  status: BookingLeadStatus;
  source: BookingLeadSource;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class BookingLeadRepository {
  constructor(private readonly database: DatabaseService) {}

  async resolvePublicPropertyId(input: PublicPropertyResolutionInput): Promise<string | null> {
    const matched = await this.database.client.query<{ property_id: string }>(
      `SELECT rooms.property_id
       FROM rooms
       JOIN room_buildings ON room_buildings.id = rooms.building_id
       JOIN properties ON properties.id = rooms.property_id
       WHERE properties.status = 'active'
         AND rooms.room_status = 'vacant'
         AND rooms.public_visible = true
         AND room_buildings.public_visible = true
         AND room_buildings.category = $1
         AND room_buildings.gender_policy = $2
         AND ($3::text IS NULL OR room_buildings.building_code = $3)
         AND ($4::text IS NULL OR rooms.floor_code = $4)
       ORDER BY properties.created_at ASC
       LIMIT 1`,
      [input.category, input.gender, input.buildingCode ?? null, input.floorCode ?? null],
    );

    if (matched.rows[0]) {
      return matched.rows[0].property_id;
    }

    const fallback = await this.database.client.query<{ id: string }>(
      `SELECT id
       FROM properties
       WHERE status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    );
    return fallback.rows[0]?.id ?? null;
  }

  async findRecentDuplicate(
    input: Pick<CreateBookingLeadInput, 'propertyId' | 'category' | 'gender' | 'visitorPhone' | 'publicGroupKey'>,
    windowMinutes: number,
  ): Promise<BookingLeadRecord | null> {
    const result = await this.database.client.query<BookingLeadRow>(
      `SELECT ${this.columns()}
       FROM booking_leads
       WHERE property_id = $1
         AND visitor_phone = $2
         AND category = $3
         AND gender = $4
         AND COALESCE(public_group_key, '') = COALESCE($5::text, '')
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

  async create(input: CreateBookingLeadInput): Promise<BookingLeadRecord> {
    const result = await this.database.client.query<BookingLeadRow>(
      `INSERT INTO booking_leads (
         property_id, category, gender, building_code, floor_code, public_group_key,
         visitor_name, visitor_phone, visitor_message, preferred_move_in_date, source, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12::jsonb)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.category,
        input.gender,
        input.buildingCode ?? null,
        input.floorCode ?? null,
        input.publicGroupKey ?? null,
        input.visitorName,
        input.visitorPhone,
        input.visitorMessage ?? null,
        input.preferredMoveInDate ?? null,
        input.source,
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      ],
    );
    return this.map(result.rows[0]);
  }

  async listForProperties(propertyIds: string[], filters: ListBookingLeadsFilters): Promise<BookingLeadRecord[]> {
    if (!propertyIds.length) {
      return [];
    }

    const search = filters.search?.trim() || null;
    const phoneSearch = search?.replace(/\D/g, '') || null;
    const result = await this.database.client.query<BookingLeadRow>(
      `SELECT ${this.columns()}
       FROM booking_leads
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR category = $3)
         AND ($4::text IS NULL OR gender = $4)
         AND ($5::date IS NULL OR created_at::date >= $5::date)
         AND ($6::date IS NULL OR created_at::date <= $6::date)
         AND (
           $7::text IS NULL
           OR visitor_name ILIKE '%' || $7 || '%'
           OR ($8::text IS NOT NULL AND visitor_phone ILIKE '%' || $8 || '%')
         )
       ORDER BY created_at DESC
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
      `SELECT ${this.columns()}
       FROM booking_leads
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: BookingLeadStatus): Promise<BookingLeadRecord | null> {
    const result = await this.database.client.query<BookingLeadRow>(
      `UPDATE booking_leads
       SET status = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, property_id, category, gender, building_code, floor_code, public_group_key,
            visitor_name, visitor_phone, visitor_message, preferred_move_in_date, status,
            source, metadata, created_at, updated_at`;
  }

  private map(row: BookingLeadRow): BookingLeadRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      category: row.category,
      gender: row.gender,
      buildingCode: row.building_code,
      floorCode: row.floor_code,
      publicGroupKey: row.public_group_key,
      visitorName: row.visitor_name,
      visitorPhone: row.visitor_phone,
      visitorMessage: row.visitor_message,
      preferredMoveInDate: this.dateOnly(row.preferred_move_in_date),
      status: row.status,
      source: row.source,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private dateOnly(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }
    return value.slice(0, 10);
  }
}
