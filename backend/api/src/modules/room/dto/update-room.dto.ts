import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateRoomDto {
  @IsOptional()
  @IsUUID()
  room_type_id?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  unit_code?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'mixed'])
  gender_policy?: 'male' | 'female' | 'mixed';

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  size_label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthly_price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @IsUUID()
  primary_photo_file_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  facility_ids?: string[];
}

export class UpdateRoomStatusDto {
  @IsIn(['vacant', 'reserved', 'occupied', 'maintenance', 'inactive'])
  status!: 'vacant' | 'reserved' | 'occupied' | 'maintenance' | 'inactive';
}
