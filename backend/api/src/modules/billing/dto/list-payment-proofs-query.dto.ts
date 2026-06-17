import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListPaymentProofsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['pending_review', 'verified', 'rejected', 'expired'])
  status?: 'pending_review' | 'verified' | 'rejected' | 'expired';
}
