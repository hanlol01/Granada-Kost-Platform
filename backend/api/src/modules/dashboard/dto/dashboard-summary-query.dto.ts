import { IsOptional, IsUUID } from 'class-validator';

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;
}
