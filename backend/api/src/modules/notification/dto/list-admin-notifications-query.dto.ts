import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListAdminNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['unread', 'read', 'archived'])
  status?: 'unread' | 'read' | 'archived';
}
