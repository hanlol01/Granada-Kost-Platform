import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateSmartLockRestrictionInput,
  SmartLockRestrictionReason,
  SmartLockRestrictionRecord,
  SmartLockRestrictionStatus,
} from '../types/smart-lock.types';

type SmartLockRestrictionRow = {
  id: string;
  property_id: string;
  smart_lock_device_id: string;
  room_id: string;
  resident_id: string;
  reason_type: SmartLockRestrictionReason;
  reason_description: string;
  reason_ref_type: string | null;
  reason_ref_id: string | null;
  restriction_status: SmartLockRestrictionStatus;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  grace_period_ends_at: Date | null;
  applied_at: Date | null;
  lifted_at: Date | null;
  lifted_by_user_id: string | null;
  lift_reason: string | null;
  lift_suggested_at: Date | null;
  rejected_at: Date | null;
  rejected_by_user_id: string | null;
  rejection_reason: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class SmartLockRestrictionRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActiveForResident(residentId: string): Promise<SmartLockRestrictionRecord[]> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_restrictions
       WHERE resident_id = $1
         AND restriction_status IN ('pending_approval', 'approved', 'applied')
       ORDER BY created_at DESC`,
      [residentId],
    );
    return result.rows.map((row) => this.map(row));
  }

  async listForProperties(
    propertyIds: string[],
    status?: SmartLockRestrictionStatus,
    limit = 20,
    offset = 0,
  ): Promise<SmartLockRestrictionRecord[]> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_restrictions
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR restriction_status = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<SmartLockRestrictionRecord | null> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `SELECT ${this.columns()}
       FROM smart_lock_restrictions
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(input: CreateSmartLockRestrictionInput): Promise<SmartLockRestrictionRecord> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `INSERT INTO smart_lock_restrictions (
         property_id, smart_lock_device_id, room_id, resident_id, reason_type, reason_description,
         reason_ref_type, reason_ref_id, requested_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.smartLockDeviceId,
        input.roomId,
        input.residentId,
        input.reasonType,
        input.reasonDescription,
        input.reasonRefType ?? null,
        input.reasonRefId ?? null,
        input.requestedByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async approve(id: string, approvedByUserId: string, gracePeriodEndsAt: Date): Promise<SmartLockRestrictionRecord | null> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `UPDATE smart_lock_restrictions
       SET restriction_status = 'approved',
           approved_by_user_id = $2,
           approved_at = now(),
           grace_period_ends_at = $3,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, approvedByUserId, gracePeriodEndsAt],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async transition(
    id: string,
    status: SmartLockRestrictionStatus,
    actorUserId?: string,
    reason?: string,
  ): Promise<SmartLockRestrictionRecord | null> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `UPDATE smart_lock_restrictions
       SET restriction_status = $2,
           applied_at = CASE WHEN $2 = 'applied' THEN COALESCE(applied_at, now()) ELSE applied_at END,
           lifted_at = CASE WHEN $2 = 'lifted' THEN COALESCE(lifted_at, now()) ELSE lifted_at END,
           lifted_by_user_id = CASE WHEN $2 = 'lifted' THEN $3 ELSE lifted_by_user_id END,
           lift_reason = CASE WHEN $2 = 'lifted' THEN $4 ELSE lift_reason END,
           rejected_at = CASE WHEN $2 = 'rejected' THEN COALESCE(rejected_at, now()) ELSE rejected_at END,
           rejected_by_user_id = CASE WHEN $2 = 'rejected' THEN $3 ELSE rejected_by_user_id END,
           rejection_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE rejection_reason END,
           cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
           cancel_reason = CASE WHEN $2 = 'cancelled' THEN $4 ELSE cancel_reason END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id, status, actorUserId ?? null, reason ?? null],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async markLiftSuggested(id: string): Promise<SmartLockRestrictionRecord | null> {
    const result = await this.database.client.query<SmartLockRestrictionRow>(
      `UPDATE smart_lock_restrictions
       SET lift_suggested_at = COALESCE(lift_suggested_at, now()),
           updated_at = now()
       WHERE id = $1
       RETURNING ${this.columns()}`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private columns(): string {
    return `id, property_id, smart_lock_device_id, room_id, resident_id, reason_type, reason_description, reason_ref_type,
            reason_ref_id, restriction_status, requested_by_user_id, approved_by_user_id, approved_at, grace_period_ends_at,
            applied_at, lifted_at, lifted_by_user_id, lift_reason, lift_suggested_at, rejected_at, rejected_by_user_id,
            rejection_reason, cancelled_at, cancel_reason, created_at, updated_at`;
  }

  private map(row: SmartLockRestrictionRow): SmartLockRestrictionRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      smartLockDeviceId: row.smart_lock_device_id,
      roomId: row.room_id,
      residentId: row.resident_id,
      reasonType: row.reason_type,
      reasonDescription: row.reason_description,
      reasonRefType: row.reason_ref_type,
      reasonRefId: row.reason_ref_id,
      restrictionStatus: row.restriction_status,
      requestedByUserId: row.requested_by_user_id,
      approvedByUserId: row.approved_by_user_id,
      approvedAt: row.approved_at,
      gracePeriodEndsAt: row.grace_period_ends_at,
      appliedAt: row.applied_at,
      liftedAt: row.lifted_at,
      liftedByUserId: row.lifted_by_user_id,
      liftReason: row.lift_reason,
      liftSuggestedAt: row.lift_suggested_at,
      rejectedAt: row.rejected_at,
      rejectedByUserId: row.rejected_by_user_id,
      rejectionReason: row.rejection_reason,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
