import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../infrastructure/database/database.service';
import { SmartLockDeviceGatewayRecord, SmartLockDeviceGatewayStatus } from '../types/smart-lock-runtime.types';

type SmartLockDeviceGatewayRow = {
  id: string;
  smart_lock_device_id: string;
  gateway_id: string;
  provider_device_id: string;
  mapping_status: SmartLockDeviceGatewayStatus;
  bound_at: Date;
  last_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockDeviceGatewayRepository {
  constructor(private readonly database: DatabaseService) {}

  async findActiveForDevice(deviceId: string): Promise<SmartLockDeviceGatewayRecord | null> {
    const result = await this.database.client.query<SmartLockDeviceGatewayRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_device_gateways
       WHERE smart_lock_device_id = $1
         AND mapping_status = 'active'
       LIMIT 1`,
      [deviceId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async bind(input: {
    smartLockDeviceId: string;
    gatewayId: string;
    providerDeviceId: string;
    mappingStatus?: SmartLockDeviceGatewayStatus;
  }): Promise<SmartLockDeviceGatewayRecord> {
    const result = await this.database.client.query<SmartLockDeviceGatewayRow>(
      `INSERT INTO smart_lock_device_gateways (
         smart_lock_device_id, gateway_id, provider_device_id, mapping_status
       )
       VALUES ($1, $2, $3, COALESCE($4, 'active'))
       RETURNING ${this.columns()}`,
      [input.smartLockDeviceId, input.gatewayId, input.providerDeviceId, input.mappingStatus ?? null],
    );
    return this.map(result.rows[0]);
  }

  async markVerified(id: string): Promise<void> {
    await this.database.client.query(
      `UPDATE smart_lock_device_gateways
       SET last_verified_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [id],
    );
  }

  private columns(): string {
    return `id, smart_lock_device_id, gateway_id, provider_device_id, mapping_status, bound_at,
            last_verified_at, created_at, updated_at`;
  }

  private map(row: SmartLockDeviceGatewayRow): SmartLockDeviceGatewayRecord {
    return {
      id: row.id,
      smartLockDeviceId: row.smart_lock_device_id,
      gatewayId: row.gateway_id,
      providerDeviceId: row.provider_device_id,
      mappingStatus: row.mapping_status,
      boundAt: row.bound_at,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
