import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../billing/dto/pagination-query.dto';
import {
  BookingLeadCategory,
  BookingLeadGender,
  BookingLeadStatus,
} from '../types/booking-lead.types';

const optionalTrimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : undefined;
};

const optionalLowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim().toLowerCase();
  return trimmed.length ? trimmed : undefined;
};

const optionalTrim = Transform(optionalTrimmedString);
const optionalTrimLower = Transform(optionalLowerString);

export class ListBookingLeadsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @optionalTrimLower
  @IsIn(['new', 'contacted', 'visit_scheduled', 'converted', 'rejected', 'expired'])
  status?: BookingLeadStatus;

  @IsOptional()
  @optionalTrimLower
  @IsIn(['rukost', 'apartkost'])
  category?: BookingLeadCategory;

  @IsOptional()
  @optionalTrimLower
  @IsIn(['male', 'female'])
  gender?: BookingLeadGender;

  @IsOptional()
  @optionalTrim
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @optionalTrim
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @optionalTrim
  @IsString()
  @MaxLength(120)
  search?: string;
}
