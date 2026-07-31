import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CommitOnboardingDto {
  @IsUUID('4') property_id!: string;
  @IsUUID('4') @IsOptional() booking_lead_id?: string;
  @IsUUID('4') @IsOptional() room_id?: string;
  @IsUUID('4') @IsOptional() resident_id?: string;
  @Transform(trim) @IsString() @MaxLength(160) visitor_name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) visitor_phone?: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) visitor_email?: string;
  @Transform(trim) @IsString() @IsIn(['male', 'female']) @MaxLength(40) gender!: string;
  @IsDateString() start_date!: string;
  @IsInt() @Min(12) @Max(120) term_months!: number;
  @IsIn(['monthly', 'yearly']) billing_cycle!: 'monthly' | 'yearly';
  @IsIn(['annual_full', 'two_month_installments']) payment_plan_type!:
    | 'annual_full'
    | 'two_month_installments';
  @Transform(trim) @IsString() @MaxLength(64) accepted_terms_version!: string;
  @IsInt() @Min(0) dp_verified_amount!: number;
  @IsInt() @Min(0) security_deposit_funded_amount!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}
