import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  date_from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  date_to?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  payment_plan?: string;

  @IsOptional()
  @IsIn(['active', 'started', 'ended'])
  date_basis?: 'active' | 'started' | 'ended';

  @IsOptional()
  @IsIn(['yes', 'no'])
  has_evidence?: 'yes' | 'no';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class ReportExportQueryDto extends ReportQueryDto {
  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';
}
