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
import type {
  HunianGalleryCategory,
  HunianGalleryFloorCode,
  HunianGalleryGender,
} from '../types/hunian-gallery.types';
import { OptionalTrim, Trim, TrimLower, TrimUpper } from './hunian-gallery-dto.util';

export class CreateHunianGalleryImageDto {
  @IsOptional()
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @TrimLower
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(160)
  catalogSlug!: string;

  @IsOptional()
  @Trim
  @IsString()
  @MaxLength(160)
  publicGroupKey!: string;

  @IsOptional()
  @TrimLower
  @IsIn(['rukost', 'apartkost'])
  category!: HunianGalleryCategory;

  @IsOptional()
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

  @IsOptional()
  @IsUUID('4')
  fileId!: string;

  @IsOptional()
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

  @IsOptional()
  @IsIn(['kost_type', 'common_area'])
  target_type?: 'kost_type' | 'common_area';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(['lobby', 'dapur', 'rooftop', 'koridor', 'parkir'])
  common_area_key?: string;

  @IsOptional()
  @IsUUID('4')
  file_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  alt_text?: string;

  @IsOptional()
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}
