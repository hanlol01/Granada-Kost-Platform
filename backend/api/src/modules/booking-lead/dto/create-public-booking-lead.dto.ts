import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  BookingLeadCategory,
  BookingLeadFloorCode,
  BookingLeadGenderInput,
} from '../types/booking-lead.types';

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

const optionalUpperString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim().toUpperCase();
  return trimmed.length ? trimmed : undefined;
};

const lowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue;
};

const optionalLowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = lowerString({ value } as TransformFnParams);
  return typeof rawValue === 'string' && rawValue.length === 0 ? undefined : rawValue;
};

const trim = Transform(requiredTrimmedString);
const optionalTrim = Transform(optionalTrimmedString);
const trimLower = Transform(lowerString);
const optionalTrimLower = Transform(optionalLowerString);
const optionalTrimUpper = Transform(optionalUpperString);

export class CreatePublicBookingLeadDto {
  @trimLower
  @IsIn(['rukost', 'apartkost'])
  category!: BookingLeadCategory;

  @trimLower
  @IsIn(['male', 'female', 'putra', 'putri'])
  gender!: BookingLeadGenderInput;

  @IsOptional()
  @optionalTrimUpper
  @IsString()
  @MaxLength(16)
  @Matches(/^[0-9A-Z]+$/)
  buildingCode?: string;

  @IsOptional()
  @optionalTrimUpper
  @IsIn(['A', 'B'])
  floorCode?: BookingLeadFloorCode;

  @IsOptional()
  @optionalTrimLower
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/)
  publicGroupKey?: string;

  @trim
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  visitorName!: string;

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

  @IsOptional()
  @optionalTrim
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  preferredMoveInDate?: string;
}
