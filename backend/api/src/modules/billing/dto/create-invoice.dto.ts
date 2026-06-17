import { IsInt, IsString, IsUUID, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  resident_id!: string;

  @IsUUID()
  room_id!: string;

  @IsUUID()
  occupancy_id!: string;

  @IsUUID()
  billing_period_id!: string;

  @IsString()
  invoice_code!: string;

  @IsInt()
  @Min(0)
  subtotal_amount!: number;

  @IsString()
  due_date!: string;

  @IsString()
  snapshot_period_key!: string;

  @IsString()
  snapshot_period_start_date!: string;

  @IsString()
  snapshot_period_end_date!: string;

  @IsString()
  snapshot_room_number!: string;

  @IsString()
  snapshot_resident_name!: string;

  @IsInt()
  @Min(0)
  snapshot_monthly_price!: number;
}
