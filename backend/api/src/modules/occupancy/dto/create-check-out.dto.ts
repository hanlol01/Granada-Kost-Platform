import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCheckOutRequestDto {
  @IsUUID()
  occupancy_id!: string;

  @IsDateString()
  requested_check_out_date!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
