import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
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
}

export class ReorderHunianGalleryDto {
  @TrimLower
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(160)
  catalogSlug!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderHunianGalleryItemDto)
  items!: ReorderHunianGalleryItemDto[];
}
