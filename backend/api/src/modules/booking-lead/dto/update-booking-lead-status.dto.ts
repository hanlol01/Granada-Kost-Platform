import { IsIn } from 'class-validator';
import { BookingLeadStatus } from '../types/booking-lead.types';

export class UpdateBookingLeadStatusDto {
  @IsIn(['new', 'contacted', 'visit_scheduled', 'converted', 'rejected', 'expired'])
  status!: BookingLeadStatus;
}
