import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBooleanString,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

const trimOptional = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export class ListPropertyOwnersQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class PropertyOwnerPropertyQueryDto {
  @IsUUID()
  property_id!: string;
}

export class PropertyOwnerAssetOptionsQueryDto extends PropertyOwnerPropertyQueryDto {}

export class CreatePropertyOwnerDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;

  @ValidateIf((value: CreatePropertyOwnerDto) => Boolean(value.email))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  initial_password!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  payout_bank_name?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  payout_account_number?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(150)
  payout_account_holder?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(2000)
  owner_visible_note?: string | null;
}

export class UpdatePropertyOwnerDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ValidateIf((value: UpdatePropertyOwnerDto) => value.email !== undefined && value.email !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  payout_bank_name?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  payout_account_number?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(150)
  payout_account_holder?: string | null;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(2000)
  owner_visible_note?: string | null;
}

export class ResetPropertyOwnerPasswordDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  new_password!: string;
}

export class AssignOwnerBuildingDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  building_id!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class AssignOwnerRoomsDto {
  @IsUUID()
  property_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  room_ids!: string[];

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class ReleaseOwnerAssignmentDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class ReleaseOwnerAssignmentsDto extends ReleaseOwnerAssignmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  assignment_ids!: string[];
}

export class CloseOwnerReportPeriodDto extends PropertyOwnerPropertyQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notes?: string;
}

export class OwnerSettlementReportQueryDto extends PropertyOwnerPropertyQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';

  @IsOptional()
  @IsIn(['not_prepared', 'draft', 'ready_for_review', 'approved', 'paid', 'void'])
  review_status?: 'not_prepared' | 'draft' | 'ready_for_review' | 'approved' | 'paid' | 'void';

  @IsOptional()
  @IsIn(['not_published', 'published'])
  publication_status?: 'not_published' | 'published';

  @IsOptional()
  @IsIn(['not_paid', 'partially_paid', 'paid'])
  payout_status?: 'not_paid' | 'partially_paid' | 'paid';

  @IsOptional()
  @IsBooleanString()
  actionable_only?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class OwnerSettlementPeriodDto extends PropertyOwnerPropertyQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notes?: string;
}

export class RecordOwnerPayoutDto extends OwnerSettlementPeriodDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(['bank_transfer', 'cash', 'other'])
  method!: 'bank_transfer' | 'cash' | 'other';

  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  reference!: string;

  @Transform(trimOptional)
  @IsString()
  @MinLength(5)
  @MaxLength(150)
  @Matches(/\*/)
  destination_mask!: string;

  @IsDateString({ strict: true })
  transferred_at!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];
}

export class CreateOwnerSettlementAdjustmentDto extends OwnerSettlementPeriodDto {
  @IsIn(['reversal', 'refund', 'transfer_proration', 'clawback'])
  adjustment_kind!: 'reversal' | 'refund' | 'transfer_proration' | 'clawback';

  @Type(() => Number)
  @IsInt()
  gross_amount_delta!: number;

  @Type(() => Number)
  @IsInt()
  owner_amount_delta!: number;

  @Type(() => Number)
  @IsInt()
  operator_fee_amount_delta!: number;

  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsUUID('4')
  earning_id!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];
}

/** Full-contract payout DTOs. Legacy settlement DTOs above remain supported
 * for historical reports, while these drive the Owner Realization workflow. */
export class OwnerRealizationQueryDto extends PropertyOwnerPropertyQueryDto {
  @IsOptional()
  @IsIn(['pdf', 'xlsx'])
  format?: 'pdf' | 'xlsx';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn([
    'not_prepared',
    'draft',
    'awaiting_review',
    'approved',
    'submitted_to_finance',
    'awaiting_transfer',
    'partially_realized',
    'realized',
    'published_to_owner',
    'void',
  ])
  status?: string;

  @IsOptional()
  @IsIn(['active', 'history', 'not_eligible'])
  workspace?: 'active' | 'history' | 'not_eligible';

  /** Archived profiles require an explicit Admin filter in realization workspaces. */
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  owner_profile_status?: 'active' | 'archived' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class PrepareOwnerRealizationDto extends PropertyOwnerPropertyQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  selected_lease_ids?: string[];

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  notes?: string;
}

export class ChangeOwnerRealizationStatusDto extends PropertyOwnerPropertyQueryDto {
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class CancelOwnerRealizationDto extends PropertyOwnerPropertyQueryDto {
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** @deprecated Use CancelOwnerRealizationDto for all pre-transfer states. */
export class VoidOwnerRealizationDraftDto extends CancelOwnerRealizationDto {}

export class CreateOwnerRealizationCorrectionDto extends PropertyOwnerPropertyQueryDto {
  @IsIn(['contract_correction', 'transfer_recovery', 'approved_operational_adjustment'])
  correction_kind!: 'contract_correction' | 'transfer_recovery' | 'approved_operational_adjustment';

  @Type(() => Number)
  @IsInt()
  amount!: number;

  @Transform(trimOptional)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(300)
  evidence_reference?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(300)
  source_reference?: string;

  @ValidateIf(
    (dto: CreateOwnerRealizationCorrectionDto) => dto.correction_kind === 'transfer_recovery',
  )
  @IsIn(['recover_from_owner', 'net_against_future_realization', 'outside_system_finance'])
  recovery_disposition?:
    | 'recover_from_owner'
    | 'net_against_future_realization'
    | 'outside_system_finance';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];
}

export class RecordOwnerRealizationTransferDto extends PropertyOwnerPropertyQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsIn(['bank_transfer'])
  method!: 'bank_transfer';

  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  reference!: string;

  @IsDateString({ strict: true })
  transferred_at!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(300)
  evidence_reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  finance_confirmed_by?: string;

  @IsOptional()
  @IsIn(['telepon', 'pesan', 'email', 'tatap_muka'])
  finance_confirmation_channel?: 'telepon' | 'pesan' | 'email' | 'tatap_muka';

  @IsOptional()
  @IsDateString({ strict: true })
  finance_confirmed_at?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  legacy_evidence_reason?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  legacy_evidence_source?: string;
}

export class RecordOwnerRealizationRecoveryEventDto extends PropertyOwnerPropertyQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsDateString({ strict: true })
  occurred_at!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  finance_reference?: string;

  @Transform(trimOptional)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  note!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];
}

export class CreateHistoricalOwnerRealizationLineDto {
  @IsOptional()
  @IsUUID('4')
  lease_id?: string;

  @IsOptional()
  @IsUUID('4')
  room_id?: string;

  @Transform(trimOptional)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  room_code!: string;

  @Transform(trimOptional)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  resident_name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  contract_total!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  management_fee!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  correction_amount = 0;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(150)
  legacy_reference?: string;

  /**
   * Historical records may be imported before every old lease is reconciled.
   * These fields preserve the facts supplied by Finance when there is no safe
   * one-to-one lease match.  They are optional because linked leases remain
   * the authoritative source whenever a match can be made.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  duration_months?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  payment_completed_at?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  check_in_at?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  check_out_at?: string;
}

export class CreateHistoricalOwnerRealizationTransferDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  @IsIn(['bank_transfer'])
  method!: 'bank_transfer';

  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  reference!: string;

  @IsDateString({ strict: true })
  transferred_at!: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(300)
  evidence_reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  evidence_file_ids?: string[];

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  legacy_evidence_reason?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  finance_confirmed_by?: string;

  @IsOptional()
  @IsIn(['telepon', 'pesan', 'email', 'tatap_muka'])
  finance_confirmation_channel?: 'telepon' | 'pesan' | 'email' | 'tatap_muka';

  @IsOptional()
  @IsDateString({ strict: true })
  finance_confirmed_at?: string;
}

export class CreateHistoricalOwnerRealizationDto extends PrepareOwnerRealizationDto {
  @IsIn(['historical_manual', 'historical_import'])
  entry_kind!: 'historical_manual' | 'historical_import';

  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  historical_source!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateHistoricalOwnerRealizationLineDto)
  lines!: CreateHistoricalOwnerRealizationLineDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transfer_amount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateHistoricalOwnerRealizationTransferDto)
  transfers?: CreateHistoricalOwnerRealizationTransferDto[];

  @IsOptional()
  @IsIn(['bank_transfer'])
  transfer_method?: 'bank_transfer';

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  transfer_reference?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  transfer_evidence_reference?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  transferred_at?: string;
}
