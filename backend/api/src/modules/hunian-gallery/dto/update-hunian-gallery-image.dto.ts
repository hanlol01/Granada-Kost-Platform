import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { OptionalTrim } from './hunian-gallery-dto.util';

export class UpdateHunianGalleryImageDto {
  @IsOptional()
  @OptionalTrim
  @IsString()
  @MaxLength(180)
  altText?: string;

  @IsOptional()
  @OptionalTrim
  @IsString()
  @MaxLength(240)
  caption?: string | null;

  @IsOptional()
  @IsBoolean()
  publicVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
