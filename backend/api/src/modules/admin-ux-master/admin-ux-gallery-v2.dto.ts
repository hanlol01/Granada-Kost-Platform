import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { V2PaginationQueryDto } from './admin-ux-master.dto';

export class ListHunianGalleryV2QueryDto extends V2PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @IsIn(['kost_type'])
  target_type?: 'kost_type';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;
}

export class CreateHunianGalleryV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['kost_type'])
  target_type!: 'kost_type';

  @IsUUID('4')
  kost_type_id!: string;

  @IsUUID('4')
  file_id!: string;

  @IsUUID('4')
  public_derivative_file_id!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(180)
  alt_text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string;
}

export class UpdateHunianGalleryV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(180)
  alt_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string | null;
}

export class HunianGalleryMutationScopeDto {
  @IsUUID('4')
  property_id!: string;
}

export class GalleryReorderItemDto {
  @IsUUID('4')
  id!: string;

  @IsInt()
  @Min(0)
  sort_order!: number;
}

export class ReorderHunianGalleryV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['kost_type'])
  target_type!: 'kost_type';

  @IsUUID('4')
  kost_type_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GalleryReorderItemDto)
  items!: GalleryReorderItemDto[];
}
