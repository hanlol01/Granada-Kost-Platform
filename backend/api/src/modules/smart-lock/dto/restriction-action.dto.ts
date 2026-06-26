import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectRestrictionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class LiftRestrictionDto {
  @IsIn(['payment_cleared', 'manual_override', 'checkout'])
  reason!: string;
}

export class CancelRestrictionDto {
  @IsIn(['payment_received', 'requestor_cancelled'])
  reason!: string;
}
