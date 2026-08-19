import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../complaint/dto/pagination-query.dto';
import { EXPENSE_STATUSES, ExpenseStatus } from '../types/expense.types';

export class ListExpensesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(EXPENSE_STATUSES)
  status?: ExpenseStatus;
}
