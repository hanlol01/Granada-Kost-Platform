import { Transform, type TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PublicRoomGenderPolicy, RoomCategory } from '../types/room.types';

const lowerString = ({ value }: TransformFnParams): unknown => {
  const rawValue: unknown = value;
  return typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : rawValue;
};

const trimLower = Transform(lowerString);

export class PublicHunianCatalogQueryDto {
  @IsOptional()
  @trimLower
  @IsIn(['rukost', 'apartkost'])
  category?: RoomCategory;

  @IsOptional()
  @trimLower
  @IsIn(['male', 'female'])
  gender?: PublicRoomGenderPolicy;
}
