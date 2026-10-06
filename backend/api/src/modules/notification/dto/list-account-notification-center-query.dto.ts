import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListAccountNotificationCenterQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['unread', 'read', 'archived', 'active'])
  status?: 'unread' | 'read' | 'archived' | 'active';

  @IsOptional()
  @IsIn([
    'booking',
    'payments',
    'rooms',
    'checkout',
    'realization',
    'transfer',
    'service',
    'account',
  ])
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notification_type?: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  asset?: string;

  @IsOptional()
  @IsIn(['urgent', 'high', 'normal', 'low'])
  priority?: 'urgent' | 'high' | 'normal' | 'low';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
