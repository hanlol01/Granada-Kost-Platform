import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListResidentsQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
