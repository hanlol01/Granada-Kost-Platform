import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { EmergencyContactDto } from './emergency-contact.dto';

export class UpdateResidentDto {
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  ktp_number?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergency_contacts?: EmergencyContactDto[];
}
