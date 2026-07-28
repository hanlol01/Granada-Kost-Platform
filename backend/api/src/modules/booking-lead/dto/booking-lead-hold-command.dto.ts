import { IsUUID } from 'class-validator';

export class BookingLeadHoldCommandDto {
  @IsUUID()
  property_id!: string;
}
