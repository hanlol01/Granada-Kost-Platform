import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListMyNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['unread', 'read', 'archived'])
  status?: 'unread' | 'read' | 'archived';
}
