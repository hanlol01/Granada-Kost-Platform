import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TrimLower } from './hunian-gallery-dto.util';

export class ReorderHunianGalleryItemDto {
  @IsUUID('4')
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ReorderHunianGalleryDto {
  @IsOptional()
  @TrimLower
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(160)
  catalogSlug!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderHunianGalleryItemDto)
  items!: ReorderHunianGalleryItemDto[];

  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @IsIn(['kost_type', 'common_area'])
  target_type?: 'kost_type' | 'common_area';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(['lobby', 'dapur', 'rooftop', 'koridor', 'parkir'])
  common_area_key?: string;
}
