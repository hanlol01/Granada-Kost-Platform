import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @IsString()
  @MaxLength(160)
  company_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  company_address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  company_phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  company_email?: string | null;
}
