import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCheckInDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  room_id!: string;

  @IsUUID()
  resident_id!: string;

  @IsDateString()
  start_date!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
