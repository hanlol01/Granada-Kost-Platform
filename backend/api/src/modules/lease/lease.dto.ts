import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
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
