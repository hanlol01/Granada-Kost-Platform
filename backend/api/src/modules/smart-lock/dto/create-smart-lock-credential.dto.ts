import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { SmartLockCredentialType } from '../types/smart-lock.types';

export class CreateSmartLockCredentialDto {
  @IsOptional()
  @IsUUID()
  access_grant_id?: string;

  @IsIn(['pin', 'card', 'fingerprint'])
  credential_type!: SmartLockCredentialType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  credential_label!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  valid_from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  valid_until?: Date;

  @ValidateIf((dto: CreateSmartLockCredentialDto) => dto.credential_type === 'card')
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  card_number!: string;

  @ValidateIf((dto: CreateSmartLockCredentialDto) => dto.credential_type === 'fingerprint')
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  finger_index!: string;
}
