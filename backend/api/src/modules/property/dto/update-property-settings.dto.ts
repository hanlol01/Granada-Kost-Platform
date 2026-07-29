import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function rawValue({ obj, key }: TransformFnParams): unknown {
  return (obj as Record<string, unknown>)[key];
}

function hasEffectiveValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export class UpdatePropertySettingsDto {
  @ValidateIf(
    (input: UpdatePropertySettingsDto, value: unknown) =>
      hasEffectiveValue(value) ||
      ![
        input.late_fee_percent_per_day,
        input.booking_fee_amount,
        input.quiet_hour_start,
        input.guest_report_deadline,
      ].some(hasEffectiveValue),
  )
  @Transform(rawValue)
  @IsInt()
  @Min(1)
  @Max(31)
  default_due_day?: number;

  @IsOptional()
  @Transform(rawValue)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  late_fee_percent_per_day?: number;

  @IsOptional()
  @Transform(rawValue)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  booking_fee_amount?: number;

  @IsOptional()
  @Transform(rawValue)
  @Matches(TIME_PATTERN)
  quiet_hour_start?: string;

  @IsOptional()
  @Transform(rawValue)
  @Matches(TIME_PATTERN)
  guest_report_deadline?: string;
}
