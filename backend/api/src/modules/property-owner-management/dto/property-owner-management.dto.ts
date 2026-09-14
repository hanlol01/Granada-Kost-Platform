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
  ValidateIf,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

export class PropertyOwnerAssetOptionsQueryDto extends PropertyOwnerPropertyQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_date?: string;
}

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
