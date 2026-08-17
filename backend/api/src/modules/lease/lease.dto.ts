import { Type } from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LeasePaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListLeasesQueryDto extends LeasePaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @IsIn(['active', 'ended', 'cancelled', 'transferred'])
  status?: 'active' | 'ended' | 'cancelled' | 'transferred';

  @IsOptional()
  @IsUUID('4')
  resident_id?: string;

  @IsOptional()
  @IsUUID('4')
  room_id?: string;

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsString()
  q?: string;
}

export class ListLeaseResidentOptionsQueryDto extends LeasePaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;
}

export class CreateLeaseResidentDto {
  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNumberString()
  @Length(16, 16)
  ktp_number?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  place_of_birth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  emergency_phone?: string;

  @IsOptional()
  @IsUUID('4')
  ktp_file_id?: string;

  @IsOptional()
  @IsUUID('4')
  profile_photo_file_id?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';
}

export class CreateLeaseDto {
  @IsUUID('4')
  property_id!: string;

  @IsUUID('4')
  room_id!: string;

  @IsOptional()
  @IsUUID('4')
  resident_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateLeaseResidentDto)
  resident?: CreateLeaseResidentDto;

  @IsDateString()
  start_date!: string;

  @IsIn(['monthly', 'yearly'])
  billing_cycle!: 'monthly' | 'yearly';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  billing_anchor_day?: number;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  notes?: string;
}

// Commercial fields are explicitly admitted by validation so the service can
// return the stable LEASE_COMMERCIAL_FIELD_IMMUTABLE error rather than silently
// accepting or stripping them.
export class UpdateLeaseDto {
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  room_id?: string;

  @IsOptional()
  @IsUUID('4')
  resident_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billing_cycle?: 'monthly' | 'yearly';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  billing_anchor_day?: number;

  @IsOptional()
  @IsIn(['active', 'ended', 'cancelled', 'transferred'])
  lease_status?: string;
}

export class DepositPaymentDto {
  @IsIn(['cash', 'bank_transfer', 'qris', 'ewallet', 'other'])
  payment_method!: 'cash' | 'bank_transfer' | 'qris' | 'ewallet' | 'other';

  @IsOptional()
  @IsString()
  @Length(1, 128)
  payment_code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 256)
  reference_number?: string;

  @IsOptional()
  @IsDateString()
  paid_at?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

/** W07B standardized transfer reason taxonomy. `other` requires reason_detail. */
export const TRANSFER_REASON_CODES = [
  'resident_request',
  'room_issue',
  'property_operation',
  'eligibility_correction',
  'commercial_adjustment',
  'other',
] as const;

export type TransferReasonCode = (typeof TRANSFER_REASON_CODES)[number];

export class TransferLeasePreviewDto {
  @IsUUID('4')
  target_room_id!: string;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @IsIn(['end_period', 'same_day_exception'])
  transfer_path?: 'end_period' | 'same_day_exception';
}

export class TransferDepositTopUpDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => DepositPaymentDto)
  payment!: DepositPaymentDto;
}

export class TransferReasonFieldsDto {
  @IsIn(TRANSFER_REASON_CODES)
  reason_code!: TransferReasonCode;

  @ValidateIf((dto: TransferReasonFieldsDto) => dto.reason_code === 'other')
  @IsString()
  @Length(1, 2000)
  reason_detail?: string;
}

/** Normal transfer: persisted as a scheduled command, executed at the boundary. */
export class ScheduleTransferLeaseDto extends TransferReasonFieldsDto {
  @IsUUID('4')
  target_room_id!: string;

  @IsDateString()
  effective_date!: string;
}

/** Same-day transfer: distinct Admin-only exception path. */
export class TransferLeaseDto extends TransferReasonFieldsDto {
  @IsUUID('4')
  target_room_id!: string;

  @IsDateString()
  effective_date!: string;

  @IsString()
  @Length(1, 2000)
  exception_reason!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransferDepositTopUpDto)
  top_up?: TransferDepositTopUpDto;
}

export class CancelScheduledTransferDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}

/** W07C H-60 intent records no commercial term or invoice authority. */
export class CreateLeaseRenewalIntentDto {
  @IsDateString()
  effective_date!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;
}

/** Approval takes a fresh immutable commercial snapshot for the successor term. */
export class ApproveLeaseRenewalDto {
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(120)
  term_months!: number;

  @IsIn(['monthly', 'yearly'])
  billing_cycle!: 'monthly' | 'yearly';

  @IsIn(['annual_full', 'two_month_installments', 'monthly_installments'])
  payment_plan_type!: 'annual_full' | 'two_month_installments' | 'monthly_installments';
}

/** Explicit body keeps all financial lifecycle commands auditable and idempotent. */
export class PrepareLeaseRenewalFinancialsDto {}

/** Explicit body keeps activation authorization distinct from mere approval/payment. */
export class AuthorizeLeaseRenewalActivationDto {}

export class CancelLeaseRenewalDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}

export class CollectDepositDto {
  @IsIn(['collection', 'top_up'])
  transaction_type!: 'collection' | 'top_up';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DepositPaymentDto)
  payment?: DepositPaymentDto;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  override_reason?: string;
}

export class DamageDeductionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(1, 2000)
  reason!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  file_ids?: string[];
}

export class CloseRefundDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  reason?: string;
}

export class CloseLeaseDto {
  @IsDateString()
  end_date!: string;

  @IsIn(['vacant', 'maintenance'])
  room_status_after!: 'vacant' | 'maintenance';

  @IsString()
  @Length(1, 2000)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DamageDeductionDto)
  damage_deductions?: DamageDeductionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CloseRefundDto)
  refund?: CloseRefundDto;
}

export class CreateLeaseCheckoutNoticeDto {
  @IsDateString()
  effective_date!: string;

  @IsString()
  @Length(1, 2000)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notice_exception_reason?: string;
}

export class RecordLeaseCheckoutHandoverDto {
  @IsBoolean()
  key_access_confirmed!: boolean;

  @IsBoolean()
  inventory_confirmed!: boolean;

  @IsBoolean()
  parking_confirmed!: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  key_access_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  inventory_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  parking_file_ids?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class RecordLeaseCheckoutInspectionDto {
  @IsIn(['inspection_required', 'maintenance'])
  room_status_after!: 'inspection_required' | 'maintenance';

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  inspection_file_ids?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class CheckoutDamageDeductionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Length(1, 2000)
  reason!: string;

  @IsUUID('4')
  evidence_file_id!: string;
}

export class CompleteLeaseCheckoutDto {
  @IsIn(['inspection_required', 'maintenance'])
  room_status_after!: 'inspection_required' | 'maintenance';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutDamageDeductionDto)
  damage_deductions?: CheckoutDamageDeductionDto[];

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  refund_reason?: string;
}

export class CancelLeaseCheckoutDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}

export class SettleRefundDto {
  @IsIn(['cash', 'bank_transfer', 'qris', 'ewallet', 'other'])
  payment_method!: 'cash' | 'bank_transfer' | 'qris' | 'ewallet' | 'other';

  @IsString()
  @Length(1, 256)
  external_reference!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class WaiveRefundDto {
  @IsString()
  @Length(1, 2000)
  reason!: string;
}
