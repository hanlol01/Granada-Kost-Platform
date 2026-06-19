import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  email_enabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  whatsapp_enabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  push_enabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  digest_mode?: boolean;

  @IsOptional()
  @Matches(TIME_PATTERN)
  quiet_hours_start?: string;

  @IsOptional()
  @Matches(TIME_PATTERN)
  quiet_hours_end?: string;
}
