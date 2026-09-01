import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUniversityDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;
}
