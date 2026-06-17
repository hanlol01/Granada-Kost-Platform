import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePropertySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  default_due_day?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  late_fee_percent_per_day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  booking_fee_amount?: number;

  @IsOptional()
  @IsString()
  quiet_hour_start?: string;

  @IsOptional()
  @IsString()
  guest_report_deadline?: string;
}
