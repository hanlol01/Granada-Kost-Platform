import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Length,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CommitOnboardingDto {
  @IsUUID('4') property_id!: string;
  @IsUUID('4') @IsOptional() booking_lead_id?: string;
  @IsUUID('4') @IsOptional() room_id?: string;
  @IsUUID('4') @IsOptional() resident_id?: string;
  @Transform(trim) @IsString() @MaxLength(160) visitor_name!: string;
  @IsOptional() @Transform(trim) @IsNumberString() @MaxLength(20) visitor_phone?: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) visitor_email?: string;
  @Transform(trim) @IsString() @IsIn(['male', 'female']) @MaxLength(40) gender!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) place_of_birth?: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) university?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) cohort?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) faculty?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) major?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) instagram?: string;
  @IsOptional() @Transform(trim) @IsNumberString() @MaxLength(20) emergency_phone?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) parent_name?: string;
  @IsOptional() @Transform(trim) @IsNumberString() @MaxLength(20) parent_phone?: string;
  @IsOptional() @Transform(trim) @IsString() @IsNumberString() @Length(16, 16) ktp_number?: string;
  @IsUUID('4') @IsOptional() ktp_file_id?: string;
  @IsUUID('4') @IsOptional() profile_photo_file_id?: string;
  @IsDateString() start_date!: string;
  @IsInt() @Min(3) @Max(120) term_months!: number;
  @IsIn(['monthly', 'yearly']) billing_cycle!: 'monthly' | 'yearly';
  @IsIn(['annual_full', 'two_month_installments', 'monthly_installments']) payment_plan_type!:
    | 'annual_full'
    | 'two_month_installments'
    | 'monthly_installments';
  @Transform(trim) @IsString() @MaxLength(64) accepted_terms_version!: string;
  @IsInt() @Min(0) dp_verified_amount!: number;
  @IsInt() @Min(0) security_deposit_funded_amount!: number;
  @IsInt() @Min(0) @IsOptional() booking_fee_paid_amount?: number;
  @IsIn(['cash', 'bank_transfer']) payment_method!: 'cash' | 'bank_transfer';
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  @IsOptional()
  payment_evidence_file_ids?: string[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) payment_note?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
