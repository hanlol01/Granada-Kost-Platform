import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

const MAX_MONEY = Number.MAX_SAFE_INTEGER;

export const PAYMENT_PURPOSES = ['rent', 'dp', 'security_deposit', 'other_charge'] as const;
export type W06PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export class PaymentAllocationInputDto {
  @IsUUID('4') invoice_id!: string;
  @IsInt() @Min(1) @Max(MAX_MONEY) amount!: number;
}

export class RecordManualPaymentDto {
  @IsUUID('4') property_id!: string;
  @IsUUID('4') resident_id!: string;
  @IsUUID('4') lease_id!: string;
  @IsIn(['bank_transfer', 'cash']) method!: 'bank_transfer' | 'cash';
  @IsIn(PAYMENT_PURPOSES) payment_purpose!: W06PaymentPurpose;
  @IsInt() @Min(1) @Max(MAX_MONEY) amount!: number;
  @IsDateString() @IsOptional() paid_at?: string;
  @IsString() @MaxLength(100) @IsOptional() reference_number?: string;
  @IsString() @MaxLength(500) @IsOptional() note?: string;
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  evidence_file_ids?: string[];
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInputDto)
  allocations: PaymentAllocationInputDto[] = [];
}

export class VerifyManualPaymentDto {
  @IsUUID('4') property_id!: string;
}

export class ReviewPaymentProofDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(3) @MaxLength(500) @IsOptional() reason?: string;
}

export class RejectManualPaymentDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ReversePaymentDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class VoidInvoiceDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class CreateOtherChargeDto {
  @IsUUID('4') property_id!: string;
  @IsUUID('4') resident_id!: string;
  @IsUUID('4') lease_id!: string;
  @IsIn([
    'documented_damage',
    'utilities',
    'parking',
    'lost_key_or_access_card',
    'approved_administration',
    'other',
  ])
  category!:
    | 'documented_damage'
    | 'utilities'
    | 'parking'
    | 'lost_key_or_access_card'
    | 'approved_administration'
    | 'other';
  @IsString() @MinLength(3) @MaxLength(500) description!: string;
  @IsInt() @Min(1) @Max(MAX_MONEY) amount!: number;
  @IsDateString() due_date!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @ValidateIf((value: CreateOtherChargeDto) => value.category === 'documented_damage')
  evidence_file_ids?: string[];
}

export class AdminBillingWorklistQueryDto extends PaginationQueryDto {
  @IsUUID('4') property_id!: string;
  @IsString() @IsOptional() month?: string;
  @IsString() @MaxLength(100) @IsOptional() search?: string;
  @IsIn(['due_date_asc', 'due_date_desc', 'resident_asc'])
  @IsOptional()
  sort?: 'due_date_asc' | 'due_date_desc' | 'resident_asc';
  @IsIn(['issued', 'partially_paid', 'overdue'])
  @IsOptional()
  status?: 'issued' | 'partially_paid' | 'overdue';
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  due_within_days?: number;
  @IsDateString()
  @IsOptional()
  date_from?: string;
  @IsDateString()
  @IsOptional()
  date_to?: string;
}

export class AdminBillingScopeQueryDto {
  @IsUUID('4') property_id!: string;
}

export class AdminBillingDocumentSearchQueryDto extends PaginationQueryDto {
  @IsUUID('4') property_id!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

export class AdminW06PaymentsQueryDto extends PaginationQueryDto {
  @IsUUID('4') property_id!: string;
  @IsIn(['pending_confirmation', 'verified', 'rejected', 'reversed'])
  @IsOptional()
  status?: 'pending_confirmation' | 'verified' | 'rejected' | 'reversed';
  @IsString() @MaxLength(100) @IsOptional() search?: string;
  @IsIn(['bank_transfer', 'cash'])
  @IsOptional()
  method?: 'bank_transfer' | 'cash';
  @IsIn(PAYMENT_PURPOSES)
  @IsOptional()
  purpose?: W06PaymentPurpose;
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  due_within_days?: number;
  @IsDateString()
  @IsOptional()
  date_from?: string;
  @IsDateString()
  @IsOptional()
  date_to?: string;
}

export class AdminW06ProofsQueryDto extends PaginationQueryDto {
  @IsUUID('4') property_id!: string;
  @IsIn(['pending_review', 'verified', 'rejected', 'expired'])
  @IsOptional()
  status?: 'pending_review' | 'verified' | 'rejected' | 'expired';
}
