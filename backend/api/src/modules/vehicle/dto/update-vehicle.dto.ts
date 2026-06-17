import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VehicleType } from '../types/vehicle.types';

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  plate_number?: string;

  @IsOptional()
  @IsIn(['motorcycle', 'car', 'bicycle', 'electric_scooter', 'other'])
  vehicle_type?: VehicleType;

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
