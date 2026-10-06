import { IsOptional, IsUUID } from 'class-validator';

export class AssignComplaintDto {
  /** Legacy account-linked assignment, retained for existing API clients. */
  @IsOptional()
  @IsUUID('4')
  assigned_to_user_id?: string;

  /** Internal property-scoped technician directory assignment. */
  @IsOptional()
  @IsUUID('4')
  technician_profile_id?: string;
}
