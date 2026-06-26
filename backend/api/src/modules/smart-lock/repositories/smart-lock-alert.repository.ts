import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateSmartLockAlertInput,
  SmartLockAlertRecord,
  SmartLockAlertSeverity,
  SmartLockAlertStatus,
  SmartLockAlertType,
} from '../types/smart-lock.types';

type SmartLockAlertRow = {
  id: string;
  property_id: string;
  smart_lock_device_id: string;
  alert_type: SmartLockAlertType;
  severity: SmartLockAlertSeverity;
  title: string;
  description: string | null;
  alert_status: SmartLockAlertStatus;
  alert_data: Record<string, unknown> | null;
  raised_at: Date;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  resolved_at: Date | null;
  resolved_by_user_id: string | null;
  created_at: Date;
};

@Injectable()
export class SmartLockAlertRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActive(propertyId: string): Promise<SmartLockAlertRecord[]> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_alerts
       WHERE property_id = $1 AND alert_status = 'active'
       ORDER BY raised_at DESC`,
      [propertyId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(propertyIds: string[], status?: SmartLockAlertStatus, limit = 20, offset = 0): Promise<SmartLockAlertRecord[]> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_alerts
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR alert_status = $2)
       ORDER BY raised_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<SmartLockAlertRecord | null> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_alerts
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateSmartLockAlertInput): Promise<SmartLockAlertRecord> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `INSERT INTO smart_lock_alerts (
         property_id, smart_lock_device_id, alert_type, severity, title, description, alert_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.smartLockDeviceId,
        input.alertType,
        input.severity,
        input.title,
        input.description ?? null,
        input.alertData === undefined ? null : JSON.stringify(input.alertData),
      ],
    );
    return this.map(result.rows[0]);
  }

  async acknowledge(id: string, actorUserId: string): Promise<SmartLockAlertRecord | null> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `UPDATE smart_lock_alerts
       SET alert_status = 'acknowledged',
           acknowledged_at = now(),
           acknowledged_by_user_id = $2
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, actorUserId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async resolve(id: string, actorUserId?: string): Promise<SmartLockAlertRecord | null> {
    const result = await this.database.client.query<SmartLockAlertRow>(
      `UPDATE smart_lock_alerts
       SET alert_status = CASE WHEN $2::uuid IS NULL THEN 'auto_resolved' ELSE 'resolved' END,
           resolved_at = now(),
           resolved_by_user_id = $2
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, actorUserId ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, property_id, smart_lock_device_id, alert_type, severity, title, description, alert_status, alert_data,
            raised_at, acknowledged_at, acknowledged_by_user_id, resolved_at, resolved_by_user_id, created_at`;
  }

  private map(row: SmartLockAlertRow): SmartLockAlertRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      smartLockDeviceId: row.smart_lock_device_id,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      alertStatus: row.alert_status,
      alertData: row.alert_data,
      raisedAt: row.raised_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedByUserId: row.acknowledged_by_user_id,
      resolvedAt: row.resolved_at,
      resolvedByUserId: row.resolved_by_user_id,
      createdAt: row.created_at,
    };
  }
}
