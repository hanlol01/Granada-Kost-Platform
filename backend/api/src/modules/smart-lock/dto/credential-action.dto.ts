import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DisableCredentialDto {
  @IsIn(['restriction', 'manual_admin', 'checkout', 'security_incident', 'replaced'])
  reason!: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason?: string;
}
