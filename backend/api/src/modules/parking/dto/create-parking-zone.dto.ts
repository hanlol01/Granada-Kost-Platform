import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { ParkingZoneType } from '../types/parking.types';

export class CreateParkingZoneDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  zone_code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  zone_name!: string;

  @IsIn(['motorcycle', 'car', 'mixed'])
  zone_type!: ParkingZoneType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location_description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}
