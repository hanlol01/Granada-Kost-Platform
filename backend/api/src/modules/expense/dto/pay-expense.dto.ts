import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EXPENSE_PAYMENT_METHODS, ExpensePaymentMethod } from '../types/expense.types';

export class PayExpenseDto {
  @IsIn(EXPENSE_PAYMENT_METHODS)
  payment_method!: ExpensePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  reference?: string;
}
