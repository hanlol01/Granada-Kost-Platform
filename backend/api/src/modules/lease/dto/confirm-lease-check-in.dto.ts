import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConfirmLeaseCheckInDto {
  @IsUUID('4') property_id!: string;
  @IsDateString() @IsOptional() checked_in_at?: string;
  @IsString() @MaxLength(1000) @IsOptional() notes?: string;
}
