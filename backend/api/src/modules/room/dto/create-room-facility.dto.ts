import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

export class CreateRoomFacilityDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
