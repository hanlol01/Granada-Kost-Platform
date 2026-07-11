import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListRoomsQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['vacant', 'reserved', 'occupied', 'maintenance', 'inactive', 'requires_review'])
  status?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsUUID()
  room_type_id?: string;

  @IsOptional()
  @IsUUID()
  kost_type_id?: string;

  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsBoolean()
  include_active_lease?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
