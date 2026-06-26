import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateSmartLockAccessGrantInput,
  SmartLockAccessGrantRecord,
  SmartLockGrantStatus,
  SmartLockGrantType,
} from '../types/smart-lock.types';

type SmartLockAccessGrantRow = {
  id: string;
  property_id: string;
  smart_lock_device_id: string;
  resident_id: string | null;
  user_id: string;
  grant_type: SmartLockGrantType;
  grant_status: SmartLockGrantStatus;
  valid_from: Date;
  valid_until: Date | null;
  grant_purpose: string | null;
  source_ref_type: string | null;
  source_ref_id: string | null;
  created_by_user_id: string;
  suspended_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockAccessGrantRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForDevice(deviceId: string): Promise<SmartLockAccessGrantRecord[]> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_grants
       WHERE smart_lock_device_id = $1
       ORDER BY created_at DESC`,
      [deviceId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<SmartLockAccessGrantRecord | null> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_grants
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findActiveForUser(deviceId: string, userId: string): Promise<SmartLockAccessGrantRecord | null> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_grants
       WHERE smart_lock_device_id = $1
         AND user_id = $2
         AND grant_status = 'active'
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until > now())
       LIMIT 1`,
      [deviceId, userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findFirstActiveForUser(userId: string): Promise<SmartLockAccessGrantRecord | null> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_grants
       WHERE user_id = $1
         AND grant_status = 'active'
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until > now())
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateSmartLockAccessGrantInput): Promise<SmartLockAccessGrantRecord> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `INSERT INTO smart_lock_access_grants (
         property_id, smart_lock_device_id, resident_id, user_id, grant_type, valid_from, valid_until,
         grant_purpose, source_ref_type, source_ref_id, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $9, $10, $11)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.smartLockDeviceId,
        input.residentId ?? null,
        input.userId,
        input.grantType,
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.grantPurpose ?? null,
        input.sourceRefType ?? null,
        input.sourceRefId ?? null,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async transition(id: string, status: SmartLockGrantStatus, reason?: string): Promise<SmartLockAccessGrantRecord | null> {
    const result = await this.database.client.query<SmartLockAccessGrantRow>(
      `UPDATE smart_lock_access_grants
       SET grant_status = $2,
           suspended_at = CASE WHEN $2 = 'suspended' THEN COALESCE(suspended_at, now()) ELSE suspended_at END,
           revoked_at = CASE WHEN $2 = 'revoked' THEN COALESCE(revoked_at, now()) ELSE revoked_at END,
           revoke_reason = CASE WHEN $2 = 'revoked' THEN $3 ELSE revoke_reason END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status, reason ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, property_id, smart_lock_device_id, resident_id, user_id, grant_type, grant_status, valid_from, valid_until,
            grant_purpose, source_ref_type, source_ref_id, created_by_user_id, suspended_at, revoked_at, revoke_reason,
            created_at, updated_at`;
  }

  private map(row: SmartLockAccessGrantRow): SmartLockAccessGrantRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      smartLockDeviceId: row.smart_lock_device_id,
      residentId: row.resident_id,
      userId: row.user_id,
      grantType: row.grant_type,
      grantStatus: row.grant_status,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      grantPurpose: row.grant_purpose,
      sourceRefType: row.source_ref_type,
      sourceRefId: row.source_ref_id,
      createdByUserId: row.created_by_user_id,
      suspendedAt: row.suspended_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
