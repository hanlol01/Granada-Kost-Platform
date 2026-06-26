import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateSmartLockCredentialInput,
  SmartLockCredentialRecord,
  SmartLockCredentialStatus,
  SmartLockCredentialType,
} from '../types/smart-lock.types';

type SmartLockCredentialRow = {
  id: string;
  smart_lock_device_id: string;
  access_grant_id: string | null;
  credential_type: SmartLockCredentialType;
  credential_status: SmartLockCredentialStatus;
  tuya_credential_id: string | null;
  credential_label: string;
  pin_display_hash: string | null;
  valid_from: Date;
  valid_until: Date | null;
  finger_index: string | null;
  card_number_masked: string | null;
  created_by_user_id: string;
  disabled_at: Date | null;
  disabled_by_user_id: string | null;
  disable_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockCredentialRepository {
  constructor(private readonly database: DatabaseService) {}

  async listForDevice(deviceId: string, status?: SmartLockCredentialStatus): Promise<SmartLockCredentialRecord[]> {
    const result = await this.database.client.query<SmartLockCredentialRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_credentials
       WHERE smart_lock_device_id = $1
         AND ($2::text IS NULL OR credential_status = $2)
       ORDER BY created_at DESC`,
      [deviceId, status ?? null],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForUser(userId: string): Promise<SmartLockCredentialRecord[]> {
    const result = await this.database.client.query<SmartLockCredentialRow>(
      `SELECT ${this.columns('smart_lock_credentials')}
       FROM smart_lock_credentials
       JOIN smart_lock_access_grants ON smart_lock_access_grants.id = smart_lock_credentials.access_grant_id
       WHERE smart_lock_access_grants.user_id = $1
         AND smart_lock_access_grants.grant_status = 'active'
         AND smart_lock_access_grants.valid_from <= now()
         AND (smart_lock_access_grants.valid_until IS NULL OR smart_lock_access_grants.valid_until > now())
       ORDER BY smart_lock_credentials.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<SmartLockCredentialRecord | null> {
    const result = await this.database.client.query<SmartLockCredentialRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_credentials
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async activePinCount(deviceId: string): Promise<number> {
    const result = await this.database.client.query<{ active_pin_count: string }>(
      `SELECT count(*) AS active_pin_count
       FROM smart_lock_credentials
       WHERE smart_lock_device_id = $1
         AND credential_type = 'pin'
         AND credential_status = 'active'`,
      [deviceId],
    );
    return Number(result.rows[0].active_pin_count);
  }

  async create(input: CreateSmartLockCredentialInput): Promise<SmartLockCredentialRecord> {
    const result = await this.database.client.query<SmartLockCredentialRow>(
      `INSERT INTO smart_lock_credentials (
         smart_lock_device_id, access_grant_id, credential_type, credential_label, pin_display_hash,
         valid_from, valid_until, finger_index, card_number_masked, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $9, $10)
       RETURNING ${this.columns()}`,
      [
        input.smartLockDeviceId,
        input.accessGrantId ?? null,
        input.credentialType,
        input.credentialLabel,
        input.pinDisplayHash ?? null,
        input.validFrom ?? null,
        input.validUntil ?? null,
        input.fingerIndex ?? null,
        input.cardNumberMasked ?? null,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async transition(
    id: string,
    status: SmartLockCredentialStatus,
    options: { disabledByUserId?: string; disableReason?: string; tuyaCredentialId?: string } = {},
  ): Promise<SmartLockCredentialRecord | null> {
    const result = await this.database.client.query<SmartLockCredentialRow>(
      `UPDATE smart_lock_credentials
       SET credential_status = $2,
           tuya_credential_id = COALESCE($3, tuya_credential_id),
           disabled_at = CASE WHEN $2 = 'disabled' THEN COALESCE(disabled_at, now()) ELSE disabled_at END,
           disabled_by_user_id = CASE WHEN $2 = 'disabled' THEN COALESCE($4, disabled_by_user_id) ELSE disabled_by_user_id END,
           disable_reason = CASE WHEN $2 = 'disabled' THEN $5 ELSE disable_reason END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status, options.tuyaCredentialId ?? null, options.disabledByUserId ?? null, options.disableReason ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}smart_lock_device_id, ${p}access_grant_id, ${p}credential_type, ${p}credential_status, ${p}tuya_credential_id,
            ${p}credential_label, ${p}pin_display_hash, ${p}valid_from, ${p}valid_until, ${p}finger_index, ${p}card_number_masked,
            ${p}created_by_user_id, ${p}disabled_at, ${p}disabled_by_user_id, ${p}disable_reason, ${p}created_at, ${p}updated_at`;
  }

  private map(row: SmartLockCredentialRow): SmartLockCredentialRecord {
    return {
      id: row.id,
      smartLockDeviceId: row.smart_lock_device_id,
      accessGrantId: row.access_grant_id,
      credentialType: row.credential_type,
      credentialStatus: row.credential_status,
      tuyaCredentialId: row.tuya_credential_id,
      credentialLabel: row.credential_label,
      pinDisplayHash: row.pin_display_hash,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      fingerIndex: row.finger_index,
      cardNumberMasked: row.card_number_masked,
      createdByUserId: row.created_by_user_id,
      disabledAt: row.disabled_at,
      disabledByUserId: row.disabled_by_user_id,
      disableReason: row.disable_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
