import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSmartLockDeviceDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  room_id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  device_name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  tuya_device_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}
