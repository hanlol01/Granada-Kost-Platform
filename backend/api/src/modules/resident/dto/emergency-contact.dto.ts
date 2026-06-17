import { IsOptional, IsString } from 'class-validator';

export class EmergencyContactDto {
  @IsString()
  contact_name!: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsString()
  phone!: string;
}
