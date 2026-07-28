import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateTechnicianProfileInput,
  TechnicianProfileRecord,
  TechnicianReferenceRecord,
} from '../types/maintenance.types';

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

  async listReferences(propertyId: string): Promise<TechnicianReferenceRecord[]> {
    const result = await this.database.client.query<TechnicianReferenceRecord>(
      `SELECT profile.user_id, profile.display_name, profile.skill_tags
       FROM technician_profiles profile
       JOIN users ON users.id = profile.user_id
       WHERE profile.property_id = $1
         AND profile.is_active = true
         AND users.user_status = 'active'
       ORDER BY profile.display_name ASC, profile.user_id ASC`,
      [propertyId],
    );
    return result.rows;
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

  async lockActive(
    propertyId: string,
    userId: string,
    client: PoolClient,
  ): Promise<TechnicianProfileRecord | null> {
    const result = await client.query<TechnicianProfileRow>(
      `SELECT profile.id, profile.property_id, profile.user_id, profile.display_name,
              profile.phone, profile.skill_tags, profile.is_active,
              profile.created_at, profile.updated_at
       FROM technician_profiles profile
       JOIN users ON users.id = profile.user_id
       WHERE profile.property_id = $1
         AND profile.user_id = $2
         AND profile.is_active = true
         AND users.user_status = 'active'
       FOR UPDATE OF profile`,
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
      [
        input.propertyId,
        input.userId,
        input.displayName,
        input.phone ?? null,
        input.skillTags ?? null,
      ],
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
