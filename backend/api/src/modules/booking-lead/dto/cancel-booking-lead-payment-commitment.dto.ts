import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimOptional = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

/**
 * Cancels a completed booking lead before it has become a lease.  The refund
 * amount is deliberately server-derived from the original commitment.
 */
export class CancelBookingLeadPaymentCommitmentDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['cash', 'bank_transfer'])
  refund_method!: 'cash' | 'bank_transfer';

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  refund_note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  refund_evidence_file_ids?: string[];
}
