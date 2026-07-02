import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMyPaymentProofDto {
  @IsUUID()
  invoice_id!: string;

  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @IsInt()
  @Min(1)
  claimed_amount!: number;

  @IsIn(['bank_transfer', 'qris', 'ewallet', 'cash', 'other'])
  payment_method!: 'bank_transfer' | 'qris' | 'ewallet' | 'cash' | 'other';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  file_ids?: string[];
}
