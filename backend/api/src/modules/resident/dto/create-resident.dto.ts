import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { EmergencyContactDto } from './emergency-contact.dto';

export class CreateResidentDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNumberString()
  @Length(16, 16)
  ktp_number?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  place_of_birth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  emergency_phone?: string;

  @IsOptional()
  @IsUUID()
  ktp_file_id?: string;

  @IsOptional()
  @IsUUID()
  profile_photo_file_id?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergency_contacts?: EmergencyContactDto[];
}
