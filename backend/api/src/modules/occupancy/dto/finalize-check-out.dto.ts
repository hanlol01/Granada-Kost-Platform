import { IsDateString, IsIn } from 'class-validator';

export class FinalizeCheckOutDto {
  @IsDateString()
  end_date!: string;

  @IsIn(['vacant', 'maintenance'])
  room_status_after!: 'vacant' | 'maintenance';
}
