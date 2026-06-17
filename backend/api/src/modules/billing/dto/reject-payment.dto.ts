import { IsString, MinLength } from 'class-validator';

export class RejectPaymentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
