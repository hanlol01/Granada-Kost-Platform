import { IsString, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
