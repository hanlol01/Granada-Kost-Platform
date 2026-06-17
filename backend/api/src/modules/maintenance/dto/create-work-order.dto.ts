import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { COMPLAINT_PRIORITIES } from '../../complaint/constants/complaint.constants';
import { WorkOrderPriority } from '../types/maintenance.types';

export class CreateWorkOrderDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsUUID()
  room_id?: string;

  @IsOptional()
  @IsUUID()
  complaint_id?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  work_order_code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsIn(COMPLAINT_PRIORITIES)
  priority!: WorkOrderPriority;
}
