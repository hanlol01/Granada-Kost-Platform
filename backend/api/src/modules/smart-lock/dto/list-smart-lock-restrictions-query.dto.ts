import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { SmartLockRestrictionStatus } from '../types/smart-lock.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListSmartLockRestrictionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['pending_approval', 'approved', 'applied', 'rejected', 'lifted', 'cancelled'])
  status?: SmartLockRestrictionStatus;
}
