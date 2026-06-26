import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  RegisterSmartLockDeviceInput,
  SmartLockConnectionStatus,
  SmartLockDeviceRecord,
  SmartLockDeviceStatus,
  SmartLockDeviceStatusPatch,
  SmartLockState,
} from '../types/smart-lock.types';

type SmartLockDeviceRow = {
  id: string;
  property_id: string;
  room_id: string;
  device_name: string;
  tuya_device_id: string;
  model: string | null;
  connection_status: SmartLockConnectionStatus;
  lock_state: SmartLockState;
  device_status: SmartLockDeviceStatus;
  battery_percent: number | null;
  auto_lock_enabled: boolean;
  auto_lock_delay_seconds: number;
  firmware_version: string | null;
  normal_open_mode: boolean;
  last_synced_at: Date | null;
  last_activity_at: Date | null;
  commissioned_at: Date | null;
  decommissioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockDeviceRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: SmartLockDeviceStatus, limit = 20, offset = 0): Promise<SmartLockDeviceRecord[]> {
    const result = await this.database.client.query<SmartLockDeviceRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_devices
       WHERE property_id = $1
         AND ($2::text IS NULL OR device_status = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<SmartLockDeviceRecord | null> {
    const result = await this.database.client.query<SmartLockDeviceRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_devices
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findActiveByRoom(roomId: string): Promise<SmartLockDeviceRecord | null> {
    const result = await this.database.client.query<SmartLockDeviceRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_devices
       WHERE room_id = $1 AND device_status <> 'decommissioned'
       LIMIT 1`,
      [roomId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: RegisterSmartLockDeviceInput): Promise<SmartLockDeviceRecord> {
    const result = await this.database.client.query<SmartLockDeviceRow>(
      `INSERT INTO smart_lock_devices (property_id, room_id, device_name, tuya_device_id, model, commissioned_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'PALOMA DLP 2131'), now())
       RETURNING ${this.columns()}`,
      [input.propertyId, input.roomId, input.deviceName, input.tuyaDeviceId, input.model ?? null],
    );
    return this.map(result.rows[0]);
  }

  async updateStatus(id: string, patch: SmartLockDeviceStatusPatch): Promise<SmartLockDeviceRecord | null> {
    const result = await this.database.client.query<SmartLockDeviceRow>(
      `UPDATE smart_lock_devices
       SET connection_status = COALESCE($2, connection_status),
           lock_state = COALESCE($3, lock_state),
           device_status = COALESCE($4, device_status),
           battery_percent = CASE WHEN $5::boolean THEN $6 ELSE battery_percent END,
           firmware_version = CASE WHEN $7::boolean THEN $8 ELSE firmware_version END,
           normal_open_mode = COALESCE($9, normal_open_mode),
           device_name = COALESCE($10, device_name),
           model = CASE WHEN $11::boolean THEN $12 ELSE model END,
           auto_lock_enabled = COALESCE($13, auto_lock_enabled),
           auto_lock_delay_seconds = COALESCE($14, auto_lock_delay_seconds),
           last_synced_at = now(),
           last_activity_at = now(),
           decommissioned_at = CASE WHEN $4 = 'decommissioned' THEN COALESCE(decommissioned_at, now()) ELSE decommissioned_at END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [
        id,
        patch.connectionStatus ?? null,
        patch.lockState ?? null,
        patch.deviceStatus ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'batteryPercent'),
        patch.batteryPercent ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'firmwareVersion'),
        patch.firmwareVersion ?? null,
        patch.normalOpenMode ?? null,
        patch.deviceName ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'model'),
        patch.model ?? null,
        patch.autoLockEnabled ?? null,
        patch.autoLockDelaySeconds ?? null,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, property_id, room_id, device_name, tuya_device_id, model, connection_status, lock_state, device_status,
            battery_percent, auto_lock_enabled, auto_lock_delay_seconds, firmware_version, normal_open_mode,
            last_synced_at, last_activity_at, commissioned_at, decommissioned_at, created_at, updated_at`;
  }

  private map(row: SmartLockDeviceRow): SmartLockDeviceRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      roomId: row.room_id,
      deviceName: row.device_name,
      tuyaDeviceId: row.tuya_device_id,
      model: row.model,
      connectionStatus: row.connection_status,
      lockState: row.lock_state,
      deviceStatus: row.device_status,
      batteryPercent: row.battery_percent,
      autoLockEnabled: row.auto_lock_enabled,
      autoLockDelaySeconds: row.auto_lock_delay_seconds,
      firmwareVersion: row.firmware_version,
      normalOpenMode: row.normal_open_mode,
      lastSyncedAt: row.last_synced_at,
      lastActivityAt: row.last_activity_at,
      commissionedAt: row.commissioned_at,
      decommissionedAt: row.decommissioned_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
