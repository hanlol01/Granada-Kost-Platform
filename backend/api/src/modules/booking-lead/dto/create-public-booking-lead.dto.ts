import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BookingLeadCategory, BookingLeadGenderInput } from '../types/booking-lead.types';

const optionalTrimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : undefined;
};

const requiredTrimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
};

const lowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue;
};

const trim = Transform(requiredTrimmedString);
const optionalTrim = Transform(optionalTrimmedString);
const trimLower = Transform(lowerString);

export class CreatePublicBookingLeadDto {
  @trimLower
  @IsIn(['rukost', 'apartkost'])
  category!: BookingLeadCategory;

  @trimLower
  @IsIn(['male', 'female', 'putra', 'putri'])
  gender!: BookingLeadGenderInput;

  @trim
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  visitorName!: string;

  @IsOptional()
  @optionalTrim
  @IsEmail()
  @MaxLength(254)
  visitorEmail?: string;

  @trim
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^[0-9+\s().-]+$/)
  visitorPhone!: string;

  @IsOptional()
  @optionalTrim
  @IsString()
  @MaxLength(1000)
  visitorMessage?: string;

  @trim
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  visitorUniversity!: string;

  @IsBoolean()
  consent!: boolean;

  @IsOptional()
  @optionalTrim
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredMoveInDate?: string;
}
