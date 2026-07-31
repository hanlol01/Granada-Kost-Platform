import { IsIn, IsUUID } from 'class-validator';
import { BookingLeadStatus } from '../types/booking-lead.types';

export class UpdateBookingLeadStatusDto {
  @IsUUID()
  property_id!: string;

  @IsIn(['contacted', 'rejected', 'expired'])
  status!: BookingLeadStatus;
}
