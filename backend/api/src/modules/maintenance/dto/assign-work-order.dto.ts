import { IsUUID } from 'class-validator';

export class AssignWorkOrderDto {
  @IsUUID()
  assigned_to_user_id!: string;
}
