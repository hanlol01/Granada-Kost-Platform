import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['pending', 'verified', 'void'])
  status?: 'pending' | 'verified' | 'void';
}
