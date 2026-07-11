import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { V2PaginationQueryDto } from './admin-ux-master.dto';

const COMMON_AREA_KEYS = ['lobby', 'dapur', 'rooftop', 'koridor', 'parkir'] as const;

export type CommonAreaKey = (typeof COMMON_AREA_KEYS)[number];

export class ListHunianGalleryV2QueryDto extends V2PaginationQueryDto {
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
  @IsIn(COMMON_AREA_KEYS)
  common_area_key?: CommonAreaKey;
}

export class CreateHunianGalleryV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['kost_type', 'common_area'])
  target_type!: 'kost_type' | 'common_area';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(COMMON_AREA_KEYS)
  common_area_key?: CommonAreaKey;

  @IsUUID('4')
  file_id!: string;

  @IsString()
  @MaxLength(180)
  alt_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string;

  @IsOptional()
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateHunianGalleryV2Dto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  alt_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string | null;

  @IsOptional()
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class GalleryReorderItemDto {
  @IsUUID('4')
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order!: number;
}

export class ReorderHunianGalleryV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['kost_type', 'common_area'])
  target_type!: 'kost_type' | 'common_area';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(COMMON_AREA_KEYS)
  common_area_key?: CommonAreaKey;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GalleryReorderItemDto)
  items!: GalleryReorderItemDto[];
}

export { COMMON_AREA_KEYS };
