import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CancelAndArchiveLeaseDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  review_fingerprint!: string;

  @IsBoolean()
  cancellation_confirmed!: boolean;

  @IsOptional()
  @IsBoolean()
  mistaken_activation_confirmed?: boolean;
}

export class LeaseArchiveQueryDto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  q?: string;

  @IsOptional()
  @IsIn(['rent', 'owner_sponsored'])
  commercial_mode?: 'rent' | 'owner_sponsored';

  @IsOptional()
  @IsIn(['not_required', 'pending_review', 'resolved'])
  financial_resolution_state?: 'not_required' | 'pending_review' | 'resolved';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RestoreArchivedLeaseDto {
  @IsUUID('4')
  property_id!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(3, 1000)
  reason!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  review_fingerprint!: string;

  @IsBoolean()
  restoration_confirmed!: boolean;
}
