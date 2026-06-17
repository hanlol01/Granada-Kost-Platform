import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignPropertyOwnerDto {
  @IsUUID()
  user_id!: string;

  @IsOptional()
  @IsString()
  ownership_label?: string;
}
