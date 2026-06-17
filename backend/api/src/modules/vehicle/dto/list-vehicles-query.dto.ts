import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { VehicleStatus, VehicleType } from '../types/vehicle.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListVehiclesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['pending_approval', 'active', 'rejected', 'suspended', 'transfer_pending', 'inactive'])
  status?: VehicleStatus;

  @IsOptional()
  @IsIn(['motorcycle', 'car', 'bicycle', 'electric_scooter', 'other'])
  vehicle_type?: VehicleType;
}
