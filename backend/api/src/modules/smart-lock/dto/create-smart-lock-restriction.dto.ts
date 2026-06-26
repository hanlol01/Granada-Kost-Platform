import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SmartLockRestrictionReason } from '../types/smart-lock.types';

export class CreateSmartLockRestrictionDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  smart_lock_device_id!: string;

  @IsUUID()
  room_id!: string;

  @IsUUID()
  resident_id!: string;

  @IsIn(['billing_overdue', 'manual_admin', 'security_incident', 'checkout_completed'])
  reason_type!: SmartLockRestrictionReason;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason_description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason_ref_type?: string;

  @IsOptional()
  @IsUUID()
  reason_ref_id?: string;
}
