import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SmartLockConnectionStatus, SmartLockDeviceStatus, SmartLockState } from '../types/smart-lock.types';

export class UpdateSmartLockDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  device_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsIn(['online', 'offline', 'unknown'])
  connection_status?: SmartLockConnectionStatus;

  @IsOptional()
  @IsIn(['locked', 'unlocked', 'unknown'])
  lock_state?: SmartLockState;

  @IsOptional()
  @IsIn(['provisioned', 'active', 'maintenance'])
  device_status?: Exclude<SmartLockDeviceStatus, 'decommissioned'>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  battery_percent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firmware_version?: string;

  @IsOptional()
  @IsBoolean()
  auto_lock_enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600)
  auto_lock_delay_seconds?: number;
}
