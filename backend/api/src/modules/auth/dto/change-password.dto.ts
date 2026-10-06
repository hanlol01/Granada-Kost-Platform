import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  current_password?: string;

  @IsString()
  @MinLength(12)
  new_password!: string;
}
