import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, Matches, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function rawValue({ obj, key }: TransformFnParams): unknown {
  return (obj as Record<string, unknown>)[key];
}

function hasEffectiveValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export class UpdateNotificationPreferencesDto {
  @ValidateIf(
    (input: UpdateNotificationPreferencesDto, value: unknown) =>
      hasEffectiveValue(value) ||
      ![
        input.whatsapp_enabled,
        input.push_enabled,
        input.digest_mode,
        input.quiet_hours_start,
        input.quiet_hours_end,
      ].some(hasEffectiveValue),
  )
  @Transform(rawValue)
  @IsBoolean()
  email_enabled?: boolean;

  @IsOptional()
  @Transform(rawValue)
  @IsBoolean()
  whatsapp_enabled?: boolean;

  @IsOptional()
  @Transform(rawValue)
  @IsBoolean()
  push_enabled?: boolean;

  @IsOptional()
  @Transform(rawValue)
  @IsBoolean()
  digest_mode?: boolean;

  @IsOptional()
  @Transform(rawValue)
  @Matches(TIME_PATTERN)
  quiet_hours_start?: string;

  @IsOptional()
  @Transform(rawValue)
  @Matches(TIME_PATTERN)
  quiet_hours_end?: string;
}
