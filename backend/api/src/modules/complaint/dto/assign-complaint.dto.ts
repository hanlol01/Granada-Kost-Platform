import { IsUUID } from 'class-validator';

export class AssignComplaintDto {
  @IsUUID()
  assigned_to_user_id!: string;
}
