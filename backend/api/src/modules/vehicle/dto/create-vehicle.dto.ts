import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { VehicleType } from '../types/vehicle.types';

export class CreateVehicleDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  resident_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicle_code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  plate_number?: string;

  @IsIn(['motorcycle', 'car', 'bicycle', 'electric_scooter', 'other'])
  vehicle_type!: VehicleType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  custom_vehicle_type?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  year?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
