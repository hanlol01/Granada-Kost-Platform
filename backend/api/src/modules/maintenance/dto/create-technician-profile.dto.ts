import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateTechnicianProfileDto {
  @IsUUID('4')
  property_id!: string;

  @IsString()
  @Length(1, 120)
  @Matches(/\S/)
  display_name!: string;

  @IsString()
  @Length(1, 300)
  @Matches(/\S/)
  skill_tags!: string;
}
