import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SmartLockCommandRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  command_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  emergency?: boolean;
}
