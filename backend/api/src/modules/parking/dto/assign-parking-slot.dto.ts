import { IsUUID } from 'class-validator';

export class AssignParkingSlotDto {
  @IsUUID()
  vehicle_id!: string;
}
