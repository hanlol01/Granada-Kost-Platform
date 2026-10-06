import { IsBoolean, IsUUID } from 'class-validator';

export class SetTechnicianStatusDto {
  @IsUUID('4')
  property_id!: string;

  @IsBoolean()
  is_active!: boolean;
}
