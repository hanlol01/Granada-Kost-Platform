import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ParkingSlotStatus } from '../types/parking.types';

export class ListParkingSlotsQueryDto {
  @IsUUID()
  zone_id!: string;

  @IsOptional()
  @IsIn(['available', 'occupied', 'reserved', 'maintenance'])
  status?: ParkingSlotStatus;
}
