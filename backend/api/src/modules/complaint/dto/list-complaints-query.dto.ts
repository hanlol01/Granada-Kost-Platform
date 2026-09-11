import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { COMPLAINT_PRIORITIES, COMPLAINT_STATUSES } from '../constants/complaint.constants';
import {
  ComplaintAssignmentFilter,
  ComplaintListSort,
  ComplaintPriority,
  ComplaintSlaFilter,
  ComplaintStatusGroup,
  StoredComplaintStatus,
} from '../types/complaint.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListComplaintsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(COMPLAINT_STATUSES)
  status?: StoredComplaintStatus;

  @IsOptional()
  @IsUUID()
  resident_id?: string;

  @IsOptional()
  @IsIn(['waiting', 'in_progress', 'resolved', 'closed'])
  status_group?: ComplaintStatusGroup;

  @IsOptional()
  @IsIn(COMPLAINT_PRIORITIES)
  priority?: ComplaintPriority;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsIn(['breached', 'at_risk', 'on_track'])
  sla?: ComplaintSlaFilter;

  @IsOptional()
  @IsIn(['assigned', 'unassigned'])
  assignment?: ComplaintAssignmentFilter;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  room_id?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['newest', 'oldest', 'priority', 'sla'])
  sort?: ComplaintListSort;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
