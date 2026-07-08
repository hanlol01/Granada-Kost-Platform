import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import type { HunianGalleryCategory, HunianGalleryFloorCode, HunianGalleryGender } from '../types/hunian-gallery.types';
import { OptionalTrim, Trim, TrimLower, TrimUpper } from './hunian-gallery-dto.util';

export class CreateHunianGalleryImageDto {
  @TrimLower
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(160)
  catalogSlug!: string;

  @Trim
  @IsString()
  @MaxLength(160)
  publicGroupKey!: string;

  @TrimLower
  @IsIn(['rukost', 'apartkost'])
  category!: HunianGalleryCategory;

  @TrimLower
  @IsIn(['male', 'female'])
  gender!: HunianGalleryGender;

  @IsOptional()
  @OptionalTrim
  @IsString()
  @MaxLength(40)
  buildingCode?: string;

  @IsOptional()
  @TrimUpper
  @IsIn(['A', 'B'])
  floorCode?: HunianGalleryFloorCode;

  @IsUUID('4')
  fileId!: string;

  @Trim
  @IsString()
  @MaxLength(180)
  altText!: string;

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
