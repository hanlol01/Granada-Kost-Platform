import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { ComplaintCategoryRecord, ComplaintPriority, CreateComplaintCategoryInput } from '../types/complaint.types';

type ComplaintCategoryRow = {
  id: string;
  property_id: string;
  name: string;
  normalized_code: string;
  default_priority: ComplaintPriority;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ComplaintCategoryRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, includeInactive = false): Promise<ComplaintCategoryRecord[]> {
    const result = await this.database.client.query<ComplaintCategoryRow>(
      `SELECT ${this.columns()}
       FROM complaint_categories
       WHERE property_id = $1
         AND ($2::boolean = true OR is_active = true)
       ORDER BY sort_order ASC, name ASC`,
      [propertyId, includeInactive],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<ComplaintCategoryRecord | null> {
    const result = await this.database.client.query<ComplaintCategoryRow>(
      `SELECT ${this.columns()}
       FROM complaint_categories
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByCode(propertyId: string, normalizedCode: string): Promise<ComplaintCategoryRecord | null> {
    const result = await this.database.client.query<ComplaintCategoryRow>(
      `SELECT ${this.columns()}
       FROM complaint_categories
       WHERE property_id = $1 AND normalized_code = $2`,
      [propertyId, normalizedCode],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateComplaintCategoryInput): Promise<ComplaintCategoryRecord> {
    const result = await this.database.client.query<ComplaintCategoryRow>(
      `INSERT INTO complaint_categories (
         property_id, name, normalized_code, default_priority, description, icon,
         sort_order, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.name,
        input.normalizedCode,
        input.defaultPriority,
        input.description ?? null,
        input.icon ?? null,
        input.sortOrder ?? 0,
        input.createdByUserId ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  private columns(): string {
    return `id, property_id, name, normalized_code, default_priority, description, icon,
            is_active, sort_order, created_by_user_id, created_at, updated_at`;
  }

  private map(row: ComplaintCategoryRow): ComplaintCategoryRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      name: row.name,
      normalizedCode: row.normalized_code,
      defaultPriority: row.default_priority,
      description: row.description,
      icon: row.icon,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
