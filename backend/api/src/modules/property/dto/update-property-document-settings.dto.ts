import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export const DOCUMENT_SIGNATORY_ROLES = ['manager', 'dbo', 'director'] as const;
export type DocumentSignatoryRole = (typeof DOCUMENT_SIGNATORY_ROLES)[number];

export class UpdatePropertyDocumentSignatoryDto {
  @IsIn(DOCUMENT_SIGNATORY_ROLES)
  role!: DocumentSignatoryRole;

  @IsString()
  @MaxLength(120)
  full_name!: string;

  @IsString()
  @MaxLength(120)
  job_title!: string;

  @IsOptional()
  @IsUUID('4')
  signature_file_id?: string | null;
}

export class UpdatePropertyDocumentSettingsDto {
  @IsString()
  @MaxLength(160)
  property_name!: string;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => UpdatePropertyDocumentSignatoryDto)
  signatories!: UpdatePropertyDocumentSignatoryDto[];
}
