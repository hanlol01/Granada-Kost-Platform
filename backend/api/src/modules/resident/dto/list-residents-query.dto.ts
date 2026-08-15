import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListResidentsQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['draft', 'pending_activation', 'active', 'inactive', 'archived'])
  status?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended', 'not_provisioned'])
  account_status?: string;

  @IsOptional()
  @IsIn(['booking_fee', 'down_payment', 'partial_payment', 'paid_in_full'])
  rent_payment_status?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @IsOptional()
  @IsIn(['awaiting_activation', 'active', 'none'])
  tenancy_status?: string;

  @IsOptional()
  @IsIn([
    'awaiting_activation',
    'checkpoint_one_pending',
    'checkpoint_one_met',
    'final_settlement_due',
    'overdue',
    'admin_action_required',
    'termination_pending',
    'paid_in_full',
  ])
  contract_settlement_stage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  settlement_due_within_days?: number;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  created_from?: string;

  @IsOptional()
  @IsDateString()
  created_to?: string;

  @IsOptional()
  @IsBoolean()
  include_active_lease?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
