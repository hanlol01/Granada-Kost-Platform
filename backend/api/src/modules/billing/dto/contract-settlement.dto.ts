import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const MAX_MONEY = Number.MAX_SAFE_INTEGER;

export class ExtendContractSettlementDto {
  @IsUUID('4') property_id!: string;
  @IsInt() @Min(1) @Max(14) extension_days!: number;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class StartLeaseTerminationDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @IsDateString() planned_checkout_date!: string;
}

export class CancelLeaseTerminationDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class FinalizeLeaseTerminationDto {
  @IsUUID('4') property_id!: string;
  @IsString() @MaxLength(4000) @IsOptional() inspection_notes?: string;
  @IsIn(['vacant', 'maintenance']) room_status_after_checkout!: 'vacant' | 'maintenance';
  @IsInt() @Min(0) @Max(MAX_MONEY) damage_deduction_amount = 0;
  @ValidateIf((dto: FinalizeLeaseTerminationDto) => dto.damage_deduction_amount > 0)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  damage_reason?: string;
  @ValidateIf((dto: FinalizeLeaseTerminationDto) => dto.damage_deduction_amount > 0)
  @IsUUID('4')
  damage_evidence_file_id?: string;
  @IsInt() @Min(0) @Max(MAX_MONEY) refund_amount = 0;
  @ValidateIf((dto: FinalizeLeaseTerminationDto) => dto.refund_amount > 0)
  @IsIn(['cash', 'bank_transfer'])
  refund_method?: 'cash' | 'bank_transfer';
  @ValidateIf((dto: FinalizeLeaseTerminationDto) => dto.refund_amount > 0)
  @IsDateString()
  refunded_at?: string;
  @IsString() @MaxLength(1000) @IsOptional() refund_note?: string;
  @ValidateIf((dto: FinalizeLeaseTerminationDto) => dto.refund_amount > 0)
  @IsUUID('4')
  refund_evidence_file_id?: string;
}
