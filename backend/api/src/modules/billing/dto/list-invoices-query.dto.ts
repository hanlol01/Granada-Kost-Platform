import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['draft', 'issued', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void'])
  status?: 'draft' | 'issued' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void';
}
