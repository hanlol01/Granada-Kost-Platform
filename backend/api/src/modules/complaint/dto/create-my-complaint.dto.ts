import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateMyComplaintDto {
  @IsUUID()
  category_id!: string;

  @IsOptional()
  @IsUUID()
  room_id?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location_note?: string;
}
