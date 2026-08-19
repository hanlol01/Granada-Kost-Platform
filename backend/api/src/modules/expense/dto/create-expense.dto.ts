import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EXPENSE_PAYMENT_METHODS, ExpensePaymentMethod } from '../types/expense.types';

export class CreateExpenseDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  work_order_id?: string;

  @IsOptional()
  @IsUUID()
  proof_file_id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category!: string;

  @IsDateString()
  expense_date!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(EXPENSE_PAYMENT_METHODS)
  payment_method!: ExpensePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  vendor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
