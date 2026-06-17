import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ParkingSlotType } from '../types/parking.types';

export class CreateParkingSlotDto {
  @IsUUID()
  zone_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  slot_number!: string;

  @IsIn(['motorcycle', 'car'])
  slot_type!: ParkingSlotType;
}
