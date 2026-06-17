import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateRoomTypeDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  base_price!: number;

  @IsInt()
  @Min(0)
  default_deposit_amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
