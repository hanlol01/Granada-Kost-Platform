import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsUUID()
  resident_id?: string;

  @IsString()
  payment_code!: string;

  @IsIn(['cash', 'bank_transfer', 'qris', 'ewallet', 'other'])
  payment_method!: 'cash' | 'bank_transfer' | 'qris' | 'ewallet' | 'other';

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  reference_number?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
