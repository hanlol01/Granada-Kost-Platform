import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListParkingZonesQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active_only?: boolean = true;
}
