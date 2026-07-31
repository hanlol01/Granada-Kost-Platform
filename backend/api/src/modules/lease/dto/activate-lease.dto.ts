import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ActivateLeaseDto {
  @IsUUID('4') property_id!: string;
  @IsDateString() @IsOptional() activated_at?: string;
  @IsString() @MaxLength(160) @IsOptional() note?: string;
}
