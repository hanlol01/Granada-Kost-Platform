import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { V2PaginationQueryDto } from './admin-ux-master.dto';

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
  @IsString()
  floor?: string;

  @IsOptional()
  @IsIn(['vacant', 'reserved', 'occupied', 'maintenance', 'inactive', 'requires_review'])
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  include_active_lease?: boolean;
}

export class CreateRoomV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsUUID('4')
  kost_type_id!: string;

  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  room_code?: string;

  @IsUUID('4')
  building_id!: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsIn(['A', 'B'])
  floor_code?: 'A' | 'B';

  @IsOptional()
  @IsString()
  floor_label?: string;

  @IsOptional()
  @IsString()
  unit_code?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'mixed'])
  gender_policy?: 'male' | 'female' | 'mixed';

  @IsOptional()
  @IsString()
  size_label?: string;

  @IsOptional()
  @IsUUID('4')
  primary_photo_file_id?: string;

  @IsOptional()
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
  @IsUUID('4', { each: true })
  facility_ids?: string[];
}

export class UpdateRoomV2Dto {
  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  room_code?: string;

  @IsOptional()
  @IsUUID('4')
  building_id?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsIn(['A', 'B'])
  floor_code?: 'A' | 'B';

  @IsOptional()
  @IsString()
  floor_label?: string;

  @IsOptional()
  @IsString()
  unit_code?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'mixed'])
  gender_policy?: 'male' | 'female' | 'mixed';

  @IsOptional()
  @IsString()
  size_label?: string;

  @IsOptional()
  @IsUUID('4')
  primary_photo_file_id?: string;

  @IsOptional()
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
  @IsUUID('4', { each: true })
  facility_ids?: string[];
}

export class UpdateRoomV2StatusDto {
  @IsIn(['vacant', 'maintenance', 'inactive', 'requires_review', 'occupied', 'reserved'])
  status!: 'vacant' | 'maintenance' | 'inactive' | 'requires_review' | 'occupied' | 'reserved';

  @IsString()
  reason!: string;
}
