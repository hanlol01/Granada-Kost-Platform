import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateSmartLockAccessLogInput,
  SmartLockAccessAction,
  SmartLockAccessLogRecord,
  SmartLockAccessResult,
  SmartLockAccessSource,
  SmartLockAccessTrigger,
  SmartLockCredentialType,
} from '../types/smart-lock.types';

type SmartLockAccessLogRow = {
  id: string;
  property_id: string;
  smart_lock_device_id: string;
  room_id: string;
  resident_id: string | null;
  actor_user_id: string | null;
  action_type: SmartLockAccessAction;
  source: SmartLockAccessSource;
  trigger: SmartLockAccessTrigger | null;
  result_status: SmartLockAccessResult;
  failure_reason: string | null;
  credential_type_used: SmartLockCredentialType | 'remote' | 'auto_lock' | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: Date;
};

@Injectable()
export class SmartLockAccessLogRepository {
  constructor(private readonly database: DatabaseService) {}

  async record(input: CreateSmartLockAccessLogInput): Promise<SmartLockAccessLogRecord> {
    const result = await this.database.client.query<SmartLockAccessLogRow>(
      `INSERT INTO smart_lock_access_logs (
         property_id, smart_lock_device_id, room_id, resident_id, actor_user_id, action_type, source, trigger,
         result_status, failure_reason, credential_type_used, ip_address, user_agent, correlation_id, metadata, occurred_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid, $15::jsonb, COALESCE($16, now()))
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.smartLockDeviceId,
        input.roomId,
        input.residentId,
        input.actorUserId,
        input.actionType,
        input.source,
        input.trigger,
        input.resultStatus,
        input.failureReason,
        input.credentialTypeUsed,
        input.ipAddress,
        input.userAgent,
        input.correlationId,
        input.metadata === null ? null : JSON.stringify(input.metadata),
        input.occurredAt ?? null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async listForDevice(deviceId: string, limit = 20, offset = 0): Promise<SmartLockAccessLogRecord[]> {
    const result = await this.database.client.query<SmartLockAccessLogRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_logs
       WHERE smart_lock_device_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2 OFFSET $3`,
      [deviceId, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(
    propertyIds: string[],
    actionType?: SmartLockAccessAction,
    limit = 20,
    offset = 0,
  ): Promise<SmartLockAccessLogRecord[]> {
    const result = await this.database.client.query<SmartLockAccessLogRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_access_logs
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR action_type = $2)
       ORDER BY occurred_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, actionType ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  private columns(): string {
    return `id, property_id, smart_lock_device_id, room_id, resident_id, actor_user_id, action_type, source, trigger,
            result_status, failure_reason, credential_type_used, ip_address, user_agent, correlation_id, metadata, occurred_at`;
  }

  private map(row: SmartLockAccessLogRow): SmartLockAccessLogRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      smartLockDeviceId: row.smart_lock_device_id,
      roomId: row.room_id,
      residentId: row.resident_id,
      actorUserId: row.actor_user_id,
      actionType: row.action_type,
      source: row.source,
      trigger: row.trigger,
      resultStatus: row.result_status,
      failureReason: row.failure_reason,
      credentialTypeUsed: row.credential_type_used,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      correlationId: row.correlation_id,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
    };
  }
}
