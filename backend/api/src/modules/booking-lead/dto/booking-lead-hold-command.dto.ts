import { IsOptional, IsUUID } from 'class-validator';

export class BookingLeadHoldCommandDto {
  @IsUUID()
  property_id!: string;

  /**
   * Public catalog leads deliberately do not carry a room before an operator
   * creates a hold.  A quick-entry lead already has a room and may never use
   * this field to replace it.
   */
  @IsOptional()
  @IsUUID('4')
  room_id?: string;
}
