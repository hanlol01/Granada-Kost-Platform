import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
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
}
