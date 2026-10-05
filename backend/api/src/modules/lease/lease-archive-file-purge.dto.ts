import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsString, IsUUID, Length, Matches } from 'class-validator';

export class PurgeArchivedLeaseFilesDto {
  @IsUUID('4') property_id!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(3, 1000) reason!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) review_fingerprint!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) selected_file_ids!: string[];
  @IsBoolean() permanent_deletion_confirmed!: boolean;
}

export class RetryArchivedLeaseFilePurgeDto {
  @IsUUID('4') property_id!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) selected_file_ids!: string[];
}
