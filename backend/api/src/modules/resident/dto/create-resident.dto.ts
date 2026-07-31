import { Transform, Type, type TransformFnParams } from 'class-transformer';
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
function rawValue({ obj, key }: TransformFnParams): unknown {
  return (obj as Record<string, unknown>)[key];
}

export class CreateResidentDto {
  @Transform(rawValue)
  @IsUUID()
  property_id!: string;

  @Transform(rawValue)
  @IsString()
  full_name!: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  @IsNumberString()
  @Length(16, 16)
  ktp_number?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  place_of_birth?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  address?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  university?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  faculty?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  major?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  cohort?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  instagram?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  parent_name?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  parent_phone?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  marital_status?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsString()
  emergency_phone?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsUUID()
  ktp_file_id?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsUUID()
  profile_photo_file_id?: string;

  @IsOptional()
  @Transform(rawValue)
  @IsIn(['male', 'female', 'other'])
  gender?: 'male' | 'female' | 'other';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergency_contacts?: EmergencyContactDto[];
}
