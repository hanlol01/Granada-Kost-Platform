import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { PropertyRecord, PropertySettingsRecord } from '../types/property.types';
import { CreatePropertyDto } from '../dto/create-property.dto';
import { UpdatePropertyDto } from '../dto/update-property.dto';
import { UpdatePropertySettingsDto } from '../dto/update-property-settings.dto';

type PropertyRow = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: PropertyRecord['status'];
  created_at: Date;
  updated_at: Date;
};

type SettingsRow = {
  property_id: string;
  default_due_day: number;
  late_fee_percent_per_day: string;
  booking_fee_amount: number;
  quiet_hour_start: string | null;
  guest_report_deadline: string | null;
};

@Injectable()
export class PropertyRepository {
  constructor(private readonly database: DatabaseService) {}

  async listAll(): Promise<PropertyRecord[]> {
    const result = await this.database.client.query<PropertyRow>(
      `SELECT id, name, address, phone, email, timezone, status, created_at, updated_at
       FROM properties
       ORDER BY created_at DESC`,
    );
    return result.rows.map((row) => this.mapProperty(row));
  }

  async listByIds(propertyIds: string[]): Promise<PropertyRecord[]> {
    if (!propertyIds.length) {
      return [];
    }

    const result = await this.database.client.query<PropertyRow>(
      `SELECT id, name, address, phone, email, timezone, status, created_at, updated_at
       FROM properties
       WHERE id = ANY($1::uuid[])
       ORDER BY created_at DESC`,
      [propertyIds],
    );
    return result.rows.map((row) => this.mapProperty(row));
  }

  async listForPropertyOwner(userId: string): Promise<PropertyRecord[]> {
    const result = await this.database.client.query<PropertyRow>(
      `SELECT properties.id, properties.name, properties.address, properties.phone,
              properties.email, properties.timezone, properties.status,
              properties.created_at, properties.updated_at
       FROM properties
       JOIN property_owner_assignments
         ON property_owner_assignments.property_id = properties.id
        AND property_owner_assignments.ownership_status = 'active'
       WHERE property_owner_assignments.user_id = $1
       ORDER BY properties.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapProperty(row));
  }

  async findById(propertyId: string): Promise<PropertyRecord | null> {
    const result = await this.database.client.query<PropertyRow>(
      `SELECT id, name, address, phone, email, timezone, status, created_at, updated_at
       FROM properties
       WHERE id = $1
       LIMIT 1`,
      [propertyId],
    );
    return result.rows[0] ? this.mapProperty(result.rows[0]) : null;
  }

  async create(dto: CreatePropertyDto, actorUserId: string): Promise<PropertyRecord> {
    const result = await this.database.client.query<PropertyRow>(
      `INSERT INTO properties (name, address, phone, email, timezone, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, name, address, phone, email, timezone, status, created_at, updated_at`,
      [dto.name, dto.address, dto.phone ?? null, dto.email ?? null, dto.timezone ?? 'Asia/Jakarta', actorUserId],
    );

    await this.database.client.query(
      `INSERT INTO property_settings (property_id)
       VALUES ($1)
       ON CONFLICT (property_id) DO NOTHING`,
      [result.rows[0].id],
    );

    return this.mapProperty(result.rows[0]);
  }

  async update(propertyId: string, dto: UpdatePropertyDto, actorUserId: string): Promise<PropertyRecord | null> {
    const current = await this.findById(propertyId);
    if (!current) {
      return null;
    }

    const result = await this.database.client.query<PropertyRow>(
      `UPDATE properties
       SET name = COALESCE($2, name),
           address = COALESCE($3, address),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           timezone = COALESCE($6, timezone),
           updated_by_user_id = $7,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, address, phone, email, timezone, status, created_at, updated_at`,
      [
        propertyId,
        dto.name ?? null,
        dto.address ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.timezone ?? null,
        actorUserId,
      ],
    );
    return result.rows[0] ? this.mapProperty(result.rows[0]) : null;
  }

  async updateStatus(
    propertyId: string,
    status: PropertyRecord['status'],
    actorUserId: string,
  ): Promise<PropertyRecord | null> {
    const result = await this.database.client.query<PropertyRow>(
      `UPDATE properties
       SET status = $2,
           updated_by_user_id = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, address, phone, email, timezone, status, created_at, updated_at`,
      [propertyId, status, actorUserId],
    );
    return result.rows[0] ? this.mapProperty(result.rows[0]) : null;
  }

  async getSettings(propertyId: string): Promise<PropertySettingsRecord | null> {
    const result = await this.database.client.query<SettingsRow>(
      `SELECT property_id, default_due_day, late_fee_percent_per_day, booking_fee_amount,
              quiet_hour_start::text, guest_report_deadline::text
       FROM property_settings
       WHERE property_id = $1
       LIMIT 1`,
      [propertyId],
    );
    return result.rows[0] ? this.mapSettings(result.rows[0]) : null;
  }

  async updateSettings(
    propertyId: string,
    dto: UpdatePropertySettingsDto,
  ): Promise<PropertySettingsRecord> {
    const result = await this.database.client.query<SettingsRow>(
      `INSERT INTO property_settings (
         property_id, default_due_day, late_fee_percent_per_day, booking_fee_amount,
         quiet_hour_start, guest_report_deadline
       )
       VALUES ($1, COALESCE($2, 25), COALESCE($3, 1.00), COALESCE($4, 100000), $5::time, $6::time)
       ON CONFLICT (property_id) DO UPDATE
       SET default_due_day = COALESCE($2, property_settings.default_due_day),
           late_fee_percent_per_day = COALESCE($3, property_settings.late_fee_percent_per_day),
           booking_fee_amount = COALESCE($4, property_settings.booking_fee_amount),
           quiet_hour_start = COALESCE($5::time, property_settings.quiet_hour_start),
           guest_report_deadline = COALESCE($6::time, property_settings.guest_report_deadline),
           updated_at = now()
       RETURNING property_id, default_due_day, late_fee_percent_per_day, booking_fee_amount,
                 quiet_hour_start::text, guest_report_deadline::text`,
      [
        propertyId,
        dto.default_due_day ?? null,
        dto.late_fee_percent_per_day ?? null,
        dto.booking_fee_amount ?? null,
        dto.quiet_hour_start ?? null,
        dto.guest_report_deadline ?? null,
      ],
    );
    return this.mapSettings(result.rows[0]);
  }

  async assignPropertyOwner(propertyId: string, userId: string, label: string | null, actorUserId: string): Promise<void> {
    await this.database.client.query(
      `INSERT INTO property_owner_assignments (
         property_id, user_id, ownership_label, ownership_status, assigned_by_user_id
       )
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (user_id, property_id, ownership_status) DO UPDATE
       SET ownership_label = EXCLUDED.ownership_label,
           assigned_by_user_id = EXCLUDED.assigned_by_user_id`,
      [propertyId, userId, label, actorUserId],
    );
  }

  async revokePropertyOwner(propertyId: string, userId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE property_owner_assignments
       SET ownership_status = 'inactive'
       WHERE property_id = $1 AND user_id = $2 AND ownership_status = 'active'`,
      [propertyId, userId],
    );
  }

  async isPropertyOwner(userId: string, propertyId: string): Promise<boolean> {
    const result = await this.database.client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM property_owner_assignments
         WHERE user_id = $1 AND property_id = $2 AND ownership_status = 'active'
       )`,
      [userId, propertyId],
    );
    return result.rows[0]?.exists ?? false;
  }

  private mapProperty(row: PropertyRow): PropertyRecord {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      timezone: row.timezone,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSettings(row: SettingsRow): PropertySettingsRecord {
    return {
      propertyId: row.property_id,
      defaultDueDay: row.default_due_day,
      lateFeePercentPerDay: row.late_fee_percent_per_day,
      bookingFeeAmount: row.booking_fee_amount,
      quietHourStart: row.quiet_hour_start,
      guestReportDeadline: row.guest_report_deadline,
    };
  }
}
