import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { UniversityRecord } from '../types/university.types';

type UniversityRow = {
  id: string;
  property_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class UniversityRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, search?: string, limit = 100): Promise<UniversityRecord[]> {
    const result = await this.database.client.query<UniversityRow>(
      `SELECT id, property_id, name, created_at, updated_at
         FROM property_universities
        WHERE property_id = $1
          AND ($2::text IS NULL OR normalized_name LIKE '%' || lower(regexp_replace(btrim($2), '\\s+', ' ', 'g')) || '%')
        ORDER BY normalized_name ASC, id ASC
        LIMIT $3`,
      [propertyId, search?.trim() || null, limit],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findOrCreate(
    propertyId: string,
    name: string,
    actorUserId: string,
  ): Promise<{ record: UniversityRecord; created: boolean }> {
    const normalizedName = UniversityRepository.normalize(name);
    const inserted = await this.database.client.query<UniversityRow>(
      `INSERT INTO property_universities (property_id, name, normalized_name, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, normalized_name) DO NOTHING
       RETURNING id, property_id, name, created_at, updated_at`,
      [propertyId, name.trim().replace(/\s+/g, ' '), normalizedName, actorUserId],
    );
    if (inserted.rows[0]) {
      return { record: this.map(inserted.rows[0]), created: true };
    }

    const existing = await this.database.client.query<UniversityRow>(
      `SELECT id, property_id, name, created_at, updated_at
         FROM property_universities
        WHERE property_id = $1 AND normalized_name = $2
        LIMIT 1`,
      [propertyId, normalizedName],
    );
    if (!existing.rows[0]) {
      throw new Error('UNIVERSITY_INSERT_RACE_LOST');
    }
    return { record: this.map(existing.rows[0]), created: false };
  }

  static normalize(value: string): string {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  }

  private map(row: UniversityRow): UniversityRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
