import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  device_name?: string;
}
