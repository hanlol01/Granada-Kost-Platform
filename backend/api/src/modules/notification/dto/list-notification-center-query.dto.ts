import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListNotificationCenterQueryDto extends PaginationQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsIn(['unread', 'read', 'archived'])
  status?: 'unread' | 'read' | 'archived';

  @IsOptional()
  @IsIn(['urgent', 'high', 'normal', 'low'])
  priority?: 'urgent' | 'high' | 'normal' | 'low';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  notification_type?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
