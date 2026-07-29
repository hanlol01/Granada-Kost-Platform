import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

function rawTrimmedString({ obj, key }: TransformFnParams): unknown {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : value;
}

function hasEffectiveValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export class UpdatePropertyDto {
  @ValidateIf(
    (input: UpdatePropertyDto, value: unknown) =>
      hasEffectiveValue(value) ||
      ![input.address, input.phone, input.email, input.timezone].some(hasEffectiveValue),
  )
  @Transform(rawTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Transform(rawTrimmedString)
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @Transform(rawTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @Transform(rawTrimmedString)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(rawTrimmedString)
  @IsString()
  @IsNotEmpty()
  timezone?: string;
}
