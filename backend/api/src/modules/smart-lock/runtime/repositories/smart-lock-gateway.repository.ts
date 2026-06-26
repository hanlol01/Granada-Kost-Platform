import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../infrastructure/database/database.service';
import {
  CreateSmartLockGatewayInput,
  SmartLockGatewayCapabilities,
  SmartLockGatewayRecord,
  SmartLockGatewayStatus,
  SmartLockProviderType,
} from '../types/smart-lock-runtime.types';

type SmartLockGatewayRow = {
  id: string;
  property_id: string;
  provider_type: SmartLockProviderType;
  gateway_code: string;
  display_name: string;
  gateway_status: SmartLockGatewayStatus;
  priority: number;
  weight: number;
  capacity_limit: number;
  capacity_used: number;
  region: string | null;
  credential_ref: string;
  capabilities: SmartLockGatewayCapabilities;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockGatewayRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateSmartLockGatewayInput): Promise<SmartLockGatewayRecord> {
    const result = await this.database.client.query<SmartLockGatewayRow>(
      `INSERT INTO smart_lock_gateways (
         property_id, provider_type, gateway_code, display_name, priority, weight, capacity_limit,
         region, credential_ref, capabilities
       )
       VALUES ($1, $2, $3, $4, COALESCE($5, 100), COALESCE($6, 1), COALESCE($7, 0), $8, $9, COALESCE($10::jsonb, '{}'::jsonb))
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.providerType,
        input.gatewayCode,
        input.displayName,
        input.priority ?? null,
        input.weight ?? null,
        input.capacityLimit ?? null,
        input.region ?? null,
        input.credentialRef,
        input.capabilities ? JSON.stringify(input.capabilities) : null,
      ],
    );
    return this.map(result.rows[0]);
  }

  async findById(id: string): Promise<SmartLockGatewayRecord | null> {
    const result = await this.database.client.query<SmartLockGatewayRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_gateways
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async listByProperty(propertyId: string): Promise<SmartLockGatewayRecord[]> {
    const result = await this.database.client.query<SmartLockGatewayRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_gateways
       WHERE property_id = $1
       ORDER BY priority ASC, weight DESC, created_at ASC`,
      [propertyId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async candidatesForOnboarding(propertyId: string, providerType: SmartLockProviderType): Promise<SmartLockGatewayRecord[]> {
    const result = await this.database.client.query<SmartLockGatewayRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_gateways
       WHERE property_id = $1
         AND provider_type = $2
         AND gateway_status = 'active'
         AND capacity_used < capacity_limit
       ORDER BY priority ASC, weight DESC, capacity_used ASC, created_at ASC`,
      [propertyId, providerType],
    );
    return result.rows.map((row) => this.map(row));
  }

  async updateStatus(id: string, status: SmartLockGatewayStatus): Promise<SmartLockGatewayRecord | null> {
    const result = await this.database.client.query<SmartLockGatewayRow>(
      `UPDATE smart_lock_gateways
       SET gateway_status = $2,
           disabled_at = CASE WHEN $2 = 'disabled' THEN COALESCE(disabled_at, now()) ELSE disabled_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async incrementCapacity(id: string): Promise<void> {
    await this.database.client.query(
      `UPDATE smart_lock_gateways
       SET capacity_used = capacity_used + 1,
           updated_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  private columns(): string {
    return `id, property_id, provider_type, gateway_code, display_name, gateway_status, priority, weight,
            capacity_limit, capacity_used, region, credential_ref, capabilities, disabled_at, created_at, updated_at`;
  }

  private map(row: SmartLockGatewayRow): SmartLockGatewayRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      providerType: row.provider_type,
      gatewayCode: row.gateway_code,
      displayName: row.display_name,
      gatewayStatus: row.gateway_status,
      priority: row.priority,
      weight: row.weight,
      capacityLimit: row.capacity_limit,
      capacityUsed: row.capacity_used,
      region: row.region,
      credentialRef: row.credential_ref,
      capabilities: row.capabilities ?? {},
      disabledAt: row.disabled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
