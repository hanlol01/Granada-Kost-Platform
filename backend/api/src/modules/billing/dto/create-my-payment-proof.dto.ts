import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_PURPOSES, W06PaymentPurpose } from './w06-billing.dto';

export class CreateMyPaymentProofDto {
  @IsUUID()
  invoice_id!: string;

  @IsOptional()
  @IsUUID()
  payment_account_id?: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  claimed_amount!: number;

  @IsIn(['bank_transfer'])
  payment_method!: 'bank_transfer';

  @IsIn(PAYMENT_PURPOSES)
  payment_purpose: W06PaymentPurpose = 'rent';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  file_ids!: string[];
}
