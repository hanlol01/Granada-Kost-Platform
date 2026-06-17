import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../complaint/dto/pagination-query.dto';
import { WORK_ORDER_STATUSES } from '../constants/maintenance.constants';
import { StoredWorkOrderStatus } from '../types/maintenance.types';

export class ListWorkOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(WORK_ORDER_STATUSES)
  status?: StoredWorkOrderStatus;
}
