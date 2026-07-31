import { IsUUID } from 'class-validator';

export class ProvisionResidentAccountDto {
  @IsUUID()
  property_id!: string;
}
