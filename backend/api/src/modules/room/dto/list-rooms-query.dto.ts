import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListRoomsQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn(['vacant', 'reserved', 'occupied', 'maintenance', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsUUID()
  room_type_id?: string;
}
