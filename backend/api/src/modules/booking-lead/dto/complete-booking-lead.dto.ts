import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
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
} from 'class-validator';

const trimOptional = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export class CompleteBookingLeadDto {
  @IsUUID('4')
  property_id!: string;

  @IsDateString()
  start_date!: string;

  @IsInt()
  @Min(3)
  @Max(120)
  term_months!: number;

  @IsIn(['monthly', 'yearly'])
  billing_cycle!: 'monthly' | 'yearly';

  @IsIn(['monthly_installments', 'two_month_installments', 'annual_full'])
  payment_plan_type!: 'monthly_installments' | 'two_month_installments' | 'annual_full';

  @IsIn(['booking_fee', 'down_payment', 'full_settlement'])
  payment_type!: 'booking_fee' | 'down_payment' | 'full_settlement';

  @IsInt()
  @Min(0)
  rent_credit_amount!: number;

  @IsInt()
  @Min(0)
  security_deposit_amount!: number;

  @IsIn(['cash', 'bank_transfer'])
  payment_method!: 'cash' | 'bank_transfer';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  payment_evidence_file_ids?: string[];

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  payment_note?: string;

  // These values are intentionally editable before the lead becomes a
  // resident. The server still validates ownership and never trusts a room
  // identifier from this command.
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  visitor_name?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(32)
  visitor_phone?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(254)
  visitor_email?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(160)
  visitor_university?: string;
}
