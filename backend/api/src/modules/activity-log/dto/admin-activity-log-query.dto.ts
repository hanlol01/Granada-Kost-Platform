import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ACTIVITY_CATEGORIES = [
  'booking',
  'payment',
  'lease',
  'room_occupancy',
  'inspection',
  'refund',
  'notification',
  'other',
] as const;

export const ACTIVITY_RESULTS = ['succeeded', 'pending', 'rejected', 'failed'] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class AdminActivityLogQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;

  @IsOptional()
  @IsUUID()
  actor_id?: string;

  @IsOptional()
  @IsIn(['admin', 'system', 'source'])
  actor_type?: 'admin' | 'system' | 'source';

  @IsOptional()
  @IsIn(ACTIVITY_CATEGORIES)
  category?: (typeof ACTIVITY_CATEGORIES)[number];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsIn(ACTIVITY_RESULTS)
  result?: (typeof ACTIVITY_RESULTS)[number];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  target?: string;

  @IsOptional()
  @IsUUID()
  room_id?: string;

  @IsOptional()
  @IsUUID()
  resident_id?: string;

  @IsOptional()
  @IsUUID()
  lease_id?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(160)
  reference?: string;

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

export class AdminActivityLogDetailQueryDto {
  @IsUUID()
  property_id!: string;
}

export class AdminActivityLogActorQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}
