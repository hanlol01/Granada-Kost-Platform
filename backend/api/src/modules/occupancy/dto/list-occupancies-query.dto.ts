import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListOccupanciesQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['active', 'ended', 'cancelled'])
  status?: string;
}
