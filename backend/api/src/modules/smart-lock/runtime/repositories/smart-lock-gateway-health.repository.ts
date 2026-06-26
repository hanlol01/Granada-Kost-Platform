import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../infrastructure/database/database.service';
import {
  SmartLockGatewayHealthRecord,
  SmartLockGatewayHealthStatus,
} from '../types/smart-lock-runtime.types';

type SmartLockGatewayHealthRow = {
  gateway_id: string;
  health_status: SmartLockGatewayHealthStatus;
  last_checked_at: Date | null;
  last_success_at: Date | null;
  latency_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  consecutive_failures: number;
  metadata: Record<string, unknown>;
  updated_at: Date;
};

@Injectable()
export class SmartLockGatewayHealthRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsert(input: {
    gatewayId: string;
    healthStatus: SmartLockGatewayHealthStatus;
    latencyMs?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SmartLockGatewayHealthRecord> {
    const result = await this.database.client.query<SmartLockGatewayHealthRow>(
      `INSERT INTO smart_lock_gateway_health (
         gateway_id, health_status, last_checked_at, last_success_at, latency_ms, error_code,
         error_message, consecutive_failures, metadata
       )
       VALUES (
         $1, $2, now(), CASE WHEN $2 = 'healthy' THEN now() ELSE NULL END, $3, $4, $5,
         CASE WHEN $2 = 'healthy' THEN 0 ELSE 1 END, COALESCE($6::jsonb, '{}'::jsonb)
       )
       ON CONFLICT (gateway_id) DO UPDATE
       SET health_status = EXCLUDED.health_status,
           last_checked_at = now(),
           last_success_at = CASE WHEN EXCLUDED.health_status = 'healthy' THEN now() ELSE smart_lock_gateway_health.last_success_at END,
           latency_ms = EXCLUDED.latency_ms,
           error_code = EXCLUDED.error_code,
           error_message = EXCLUDED.error_message,
           consecutive_failures = CASE
             WHEN EXCLUDED.health_status = 'healthy' THEN 0
             ELSE smart_lock_gateway_health.consecutive_failures + 1
           END,
           metadata = EXCLUDED.metadata,
           updated_at = now()
       RETURNING ${this.columns()}`,
      [
        input.gatewayId,
        input.healthStatus,
        input.latencyMs ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async find(gatewayId: string): Promise<SmartLockGatewayHealthRecord | null> {
    const result = await this.database.client.query<SmartLockGatewayHealthRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_gateway_health
       WHERE gateway_id = $1`,
      [gatewayId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `gateway_id, health_status, last_checked_at, last_success_at, latency_ms, error_code,
            error_message, consecutive_failures, metadata, updated_at`;
  }

  private map(row: SmartLockGatewayHealthRow): SmartLockGatewayHealthRecord {
    return {
      gatewayId: row.gateway_id,
      healthStatus: row.health_status,
      lastCheckedAt: row.last_checked_at,
      lastSuccessAt: row.last_success_at,
      latencyMs: row.latency_ms,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      consecutiveFailures: row.consecutive_failures,
      metadata: row.metadata ?? {},
      updatedAt: row.updated_at,
    };
  }
}
