import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../infrastructure/database/database.service';
import {
  SmartLockGatewayCredentialRecord,
  SmartLockGatewayCredentialStatus,
} from '../types/smart-lock-runtime.types';

type SmartLockGatewayCredentialRow = {
  id: string;
  gateway_id: string;
  credential_ref: string;
  credential_status: SmartLockGatewayCredentialStatus;
  key_id: string | null;
  version: string;
  metadata: Record<string, unknown>;
  activated_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockGatewayCredentialRepository {
  constructor(private readonly database: DatabaseService) {}

  async findActiveForGateway(gatewayId: string): Promise<SmartLockGatewayCredentialRecord | null> {
    const result = await this.database.client.query<SmartLockGatewayCredentialRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_gateway_credentials
       WHERE gateway_id = $1
         AND credential_status IN ('active', 'rotating')
       ORDER BY activated_at DESC
       LIMIT 1`,
      [gatewayId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: {
    gatewayId: string;
    credentialRef: string;
    keyId?: string;
    version?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SmartLockGatewayCredentialRecord> {
    const result = await this.database.client.query<SmartLockGatewayCredentialRow>(
      `INSERT INTO smart_lock_gateway_credentials (
         gateway_id, credential_ref, key_id, version, metadata
       )
       VALUES ($1, $2, $3, COALESCE($4, 'v1'), COALESCE($5::jsonb, '{}'::jsonb))
       RETURNING ${this.columns()}`,
      [
        input.gatewayId,
        input.credentialRef,
        input.keyId ?? null,
        input.version ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async transition(id: string, status: SmartLockGatewayCredentialStatus): Promise<SmartLockGatewayCredentialRecord | null> {
    const result = await this.database.client.query<SmartLockGatewayCredentialRow>(
      `UPDATE smart_lock_gateway_credentials
       SET credential_status = $2,
           rotated_at = CASE WHEN $2 = 'rotating' THEN COALESCE(rotated_at, now()) ELSE rotated_at END,
           revoked_at = CASE WHEN $2 = 'revoked' THEN COALESCE(revoked_at, now()) ELSE revoked_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, gateway_id, credential_ref, credential_status, key_id, version, metadata,
            activated_at, rotated_at, revoked_at, created_at, updated_at`;
  }

  private map(row: SmartLockGatewayCredentialRow): SmartLockGatewayCredentialRecord {
    return {
      id: row.id,
      gatewayId: row.gateway_id,
      credentialRef: row.credential_ref,
      credentialStatus: row.credential_status,
      keyId: row.key_id,
      version: row.version,
      metadata: row.metadata ?? {},
      activatedAt: row.activated_at,
      rotatedAt: row.rotated_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
