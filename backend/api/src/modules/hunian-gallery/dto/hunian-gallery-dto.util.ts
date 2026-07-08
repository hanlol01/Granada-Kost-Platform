import { Transform, type TransformFnParams } from 'class-transformer';

const optionalTrimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : undefined;
};

const optionalLowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  if (typeof rawValue !== 'string') return rawValue;
  const trimmed = rawValue.trim().toLowerCase();
  return trimmed.length ? trimmed : undefined;
};

const trimmedString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
};

const lowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue;
};

const upperString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toUpperCase() : rawValue;
};

export const OptionalTrim = Transform(optionalTrimmedString);
export const OptionalTrimLower = Transform(optionalLowerString);
export const Trim = Transform(trimmedString);
export const TrimLower = Transform(lowerString);
export const TrimUpper = Transform(upperString);
