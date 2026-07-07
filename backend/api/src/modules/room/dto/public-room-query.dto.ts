import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { RoomCategory, RoomFloorCode } from '../types/room.types';

export type PublicRoomGenderInput = 'putra' | 'putri' | 'male' | 'female';

const lowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue;
};

const upperString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toUpperCase() : rawValue;
};

const trimLower = Transform(lowerString);
const trimUpper = Transform(upperString);

export class PublicRoomAvailabilityQueryDto {
  @IsOptional()
  @trimLower
  @IsIn(['putra', 'putri', 'male', 'female'])
  gender?: PublicRoomGenderInput;

  @IsOptional()
  @trimLower
  @IsIn(['rukost', 'apartkost'])
  category?: RoomCategory;

  @IsOptional()
  @trimUpper
  @IsString()
  @Matches(/^[0-9A-Z]+$/)
  buildingCode?: string;

  @IsOptional()
  @trimUpper
  @IsIn(['A', 'B'])
  floorCode?: RoomFloorCode;
}
