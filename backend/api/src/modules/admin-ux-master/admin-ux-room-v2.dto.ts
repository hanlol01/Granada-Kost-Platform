import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
} from 'class-validator';
import { V2PaginationQueryDto } from './admin-ux-master.dto';

function exactBooleanValue({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === true || raw === false) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

function trimmedString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalTrimmedString({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function clearableTrimmedString({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export class ListRoomsV2QueryDto extends V2PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';

  @IsOptional()
  @IsUUID('4')
  building_id?: string;

  @IsOptional()
  @IsIn(['A', 'B'])
  floor_code?: 'A' | 'B';

  @IsOptional()
  @IsIn([
    'vacant',
    'reserved',
    'awaiting_check_in',
    'occupied',
    'maintenance',
    'inactive',
    'requires_review',
  ])
  status?: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender_policy?: 'male' | 'female';

  @IsOptional()
  @Transform(exactBooleanValue)
  @IsBoolean()
  active_occupancy?: boolean;

  @IsOptional()
  @IsIn(['normal', 'requires_review'])
  reconciliation_state?: 'normal' | 'requires_review';

  @IsOptional()
  @IsDateString()
  commercial_date?: string;

  @IsOptional()
  @IsIn([
    'room_number',
    'building',
    'category',
    'gender_policy',
    'status',
    'active_resident',
    'updated_at',
  ])
  sort?:
    | 'room_number'
    | 'building'
    | 'category'
    | 'gender_policy'
    | 'status'
    | 'active_resident'
    | 'updated_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @Transform(exactBooleanValue)
  @IsBoolean()
  include_active_lease?: boolean;
}

export class ListRoomBuildingsV2QueryDto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';
}

export class GetRoomByNumberV2QueryDto {
  @IsUUID('4')
  property_id!: string;
}

export class CreateRoomV2Dto {
  @Transform(trimmedString)
  @IsUUID('4')
  property_id!: string;

  @Transform(trimmedString)
  @IsUUID('4')
  kost_type_id!: string;

  @Transform(trimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  number!: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  room_code?: string;

  @Transform(trimmedString)
  @IsUUID('4')
  building_id!: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  floor?: string;

  @Transform(trimmedString)
  @IsIn(['A', 'B'])
  floor_code!: 'A' | 'B';

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  floor_label?: string;

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsString()
  @MaxLength(80)
  unit_code?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsIn(['male', 'female'])
  gender_policy?: 'male' | 'female';

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsString()
  @MaxLength(80)
  size_label?: string | null;

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsUUID('4')
  primary_photo_file_id?: string | null;

  @IsOptional()
  @Transform(exactBooleanValue)
  @IsBoolean()
  public_visible?: boolean;

  // These fields are deliberately recognized so the service can reject them
  // with the contractual deterministic error instead of silently accepting them.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  monthly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  yearly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  deposit_amount?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  facility_ids?: string[];
}

export class UpdateRoomV2Dto {
  @IsOptional()
  @Transform(trimmedString)
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @Transform(trimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  number?: string;

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsString()
  @MaxLength(80)
  room_code?: string | null;

  @IsOptional()
  @Transform(trimmedString)
  @IsUUID('4')
  building_id?: string;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  floor?: string;

  @IsOptional()
  @Transform(trimmedString)
  @IsIn(['A', 'B'])
  floor_code?: 'A' | 'B';

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  floor_label?: string;

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsString()
  @MaxLength(80)
  unit_code?: string | null;

  @IsOptional()
  @Transform(optionalTrimmedString)
  @IsIn(['male', 'female'])
  gender_policy?: 'male' | 'female';

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsString()
  @MaxLength(80)
  size_label?: string | null;

  @IsOptional()
  @Transform(clearableTrimmedString)
  @IsUUID('4')
  primary_photo_file_id?: string | null;

  @IsOptional()
  @Transform(exactBooleanValue)
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  facility_ids?: string[];
}

export class UpdateRoomV2StatusDto {
  @IsIn(['vacant', 'maintenance', 'inactive', 'requires_review', 'occupied', 'reserved'])
  status!: 'vacant' | 'maintenance' | 'inactive' | 'requires_review' | 'occupied' | 'reserved';

  @IsString()
  reason!: string;
}
