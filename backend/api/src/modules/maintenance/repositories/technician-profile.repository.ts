import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreateTechnicianProfileInput, TechnicianProfileRecord } from '../types/maintenance.types';

type TechnicianProfileRow = {
  id: string;
  property_id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  skill_tags: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class TechnicianProfileRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, activeOnly = true): Promise<TechnicianProfileRecord[]> {
    const result = await this.database.client.query<TechnicianProfileRow>(
      `SELECT id, property_id, user_id, display_name, phone, skill_tags, is_active, created_at, updated_at
       FROM technician_profiles
       WHERE property_id = $1
         AND ($2::boolean = false OR is_active = true)
       ORDER BY display_name ASC`,
      [propertyId, activeOnly],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findByUser(propertyId: string, userId: string): Promise<TechnicianProfileRecord | null> {
    const result = await this.database.client.query<TechnicianProfileRow>(
      `SELECT id, property_id, user_id, display_name, phone, skill_tags, is_active, created_at, updated_at
       FROM technician_profiles
       WHERE property_id = $1 AND user_id = $2`,
      [propertyId, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async upsert(input: CreateTechnicianProfileInput): Promise<TechnicianProfileRecord> {
    const result = await this.database.client.query<TechnicianProfileRow>(
      `INSERT INTO technician_profiles (property_id, user_id, display_name, phone, skill_tags, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (property_id, user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           phone = EXCLUDED.phone,
           skill_tags = EXCLUDED.skill_tags,
           is_active = true,
           updated_at = now()
       RETURNING id, property_id, user_id, display_name, phone, skill_tags, is_active, created_at, updated_at`,
      [input.propertyId, input.userId, input.displayName, input.phone ?? null, input.skillTags ?? null],
    );
    return this.map(result.rows[0]);
  }

  private map(row: TechnicianProfileRow): TechnicianProfileRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      userId: row.user_id,
      displayName: row.display_name,
      phone: row.phone,
      skillTags: row.skill_tags,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
