import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { SmartLockDeviceStatus } from '../types/smart-lock.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListSmartLockDevicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['provisioned', 'active', 'maintenance', 'decommissioned'])
  status?: SmartLockDeviceStatus;
}
