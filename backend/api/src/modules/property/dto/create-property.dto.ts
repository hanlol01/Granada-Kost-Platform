import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
