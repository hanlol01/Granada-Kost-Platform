import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRoomTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  base_price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  default_deposit_amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
