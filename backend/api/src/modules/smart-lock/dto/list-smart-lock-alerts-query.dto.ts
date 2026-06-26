import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { SmartLockAlertStatus } from '../types/smart-lock.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListSmartLockAlertsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['active', 'acknowledged', 'resolved', 'auto_resolved'])
  status?: SmartLockAlertStatus;
}
