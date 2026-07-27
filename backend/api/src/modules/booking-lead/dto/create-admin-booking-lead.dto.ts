import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { BookingLeadGender } from '../types/booking-lead.types';

const trimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
};

const optionalTrimmedString = ({ value }: TransformFnParams): unknown => {
  const trimmed: unknown = trimmedString({ value } as TransformFnParams);
  return typeof trimmed === 'string' && trimmed.length === 0 ? undefined : trimmed;
};

const trim = Transform(trimmedString);
const optionalTrim = Transform(optionalTrimmedString);

export class CreateAdminBookingLeadDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  room_id!: string;

  @trim
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  visitor_name!: string;

  @IsIn(['male', 'female'])
  gender!: BookingLeadGender;

  @trim
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  visitor_address!: string;

  @IsOptional()
  @optionalTrim
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  visitor_university?: string;

  @trim
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^[0-9+\s().-]+$/)
  visitor_phone!: string;
}
