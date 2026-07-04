import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../billing/dto/pagination-query.dto';
import { PaymentTransactionStatus } from '../payment-gateway.types';

export class ListPaymentTransactionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'denied', 'challenge', 'requires_review', 'unknown'])
  status?: PaymentTransactionStatus;
}
