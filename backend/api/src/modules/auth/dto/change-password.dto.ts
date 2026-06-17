import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @MinLength(12)
  new_password!: string;
}
