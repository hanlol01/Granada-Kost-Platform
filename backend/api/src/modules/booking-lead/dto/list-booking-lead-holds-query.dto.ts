import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../billing/dto/pagination-query.dto';

export class ListBookingLeadHoldsQueryDto extends PaginationQueryDto {
  @IsUUID()
  property_id!: string;
}
