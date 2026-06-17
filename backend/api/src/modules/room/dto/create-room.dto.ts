import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsUUID()
  room_type_id?: string;

  @IsString()
  number!: string;

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

  @IsInt()
  @Min(0)
  monthly_price!: number;

  @IsInt()
  @Min(0)
  deposit_amount!: number;

  @IsOptional()
  @IsUUID()
  primary_photo_file_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  facility_ids?: string[];
}
