import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { COMPLAINT_STATUSES } from '../constants/complaint.constants';
import { StoredComplaintStatus } from '../types/complaint.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListComplaintsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(COMPLAINT_STATUSES)
  status?: StoredComplaintStatus;
}
