import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { BillingPeriodRecord } from '../types/billing.types';

type BillingPeriodRow = {
  id: string;
  property_id: string;
  period_key: string;
  start_date: string;
  end_date: string;
  due_date: string;
  status: BillingPeriodRecord['status'];
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class BillingPeriodRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(id: string): Promise<BillingPeriodRecord | null> {
    const result = await this.database.client.query<BillingPeriodRow>(
      `SELECT id, property_id, period_key, start_date::text, end_date::text, due_date::text,
              status, created_at, updated_at
       FROM billing_periods
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByPropertyAndKey(propertyId: string, periodKey: string): Promise<BillingPeriodRecord | null> {
    const result = await this.database.client.query<BillingPeriodRow>(
      `SELECT id, property_id, period_key, start_date::text, end_date::text, due_date::text,
              status, created_at, updated_at
       FROM billing_periods
       WHERE property_id = $1 AND period_key = $2`,
      [propertyId, periodKey],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async list(propertyId: string): Promise<BillingPeriodRecord[]> {
    const result = await this.database.client.query<BillingPeriodRow>(
      `SELECT id, property_id, period_key, start_date::text, end_date::text, due_date::text,
              status, created_at, updated_at
       FROM billing_periods
       WHERE property_id = $1
       ORDER BY period_key DESC`,
      [propertyId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: BillingPeriodRow): BillingPeriodRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      periodKey: row.period_key,
      startDate: row.start_date,
      endDate: row.end_date,
      dueDate: row.due_date,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
