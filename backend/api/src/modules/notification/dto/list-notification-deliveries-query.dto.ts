import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListNotificationDeliveriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['pending', 'sending', 'delivered', 'failed', 'dead_lettered', 'skipped'])
  status?: 'pending' | 'sending' | 'delivered' | 'failed' | 'dead_lettered' | 'skipped';

  @IsOptional()
  @IsIn(['email', 'whatsapp', 'push'])
  channel?: 'email' | 'whatsapp' | 'push';
}
