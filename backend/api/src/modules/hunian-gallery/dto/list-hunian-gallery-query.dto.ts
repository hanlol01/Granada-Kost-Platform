import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { HunianGalleryCategory, HunianGalleryGender } from '../types/hunian-gallery.types';
import { OptionalTrim, OptionalTrimLower } from './hunian-gallery-dto.util';

export class ListHunianGalleryQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @OptionalTrimLower
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(160)
  catalogSlug?: string;

  @IsOptional()
  @OptionalTrim
  @IsString()
  @MaxLength(160)
  publicGroupKey?: string;

  @IsOptional()
  @OptionalTrimLower
  @IsIn(['rukost', 'apartkost'])
  category?: HunianGalleryCategory;

  @IsOptional()
  @OptionalTrimLower
  @IsIn(['male', 'female'])
  gender?: HunianGalleryGender;

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
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
