import { IsUUID } from 'class-validator';

export class AssignComplaintDto {
  @IsUUID('4')
  assigned_to_user_id!: string;
}
