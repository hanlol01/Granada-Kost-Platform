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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class V2PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListKostTypesQueryDto extends V2PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  property_id?: string;

  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsBoolean()
  include_deleted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateKostTypeDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['rukost', 'apartkost'])
  category!: 'rukost' | 'apartkost';

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(120)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_short?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_long?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  room_size_label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_size_m2?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthly_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearly_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  deposit_amount!: number;

  @IsOptional()
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class UpdateKostTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_short?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description_long?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  room_size_label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_size_m2?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearly_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @IsBoolean()
  public_visible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  // Category is deliberately accepted only to return a deterministic immutable-field error.
  @IsOptional()
  @IsIn(['rukost', 'apartkost'])
  category?: 'rukost' | 'apartkost';
}

export class ReplaceKostTypeFacilitiesDto {
  @IsUUID('4')
  property_id!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  facility_ids!: string[];
}

export class ListFacilityCategoriesQueryDto extends V2PaginationQueryDto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateFacilityCategoryDto {
  @IsUUID('4')
  property_id!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateFacilityCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ReorderItemDto {
  @IsUUID('4')
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order!: number;
}

export class ReorderFacilityCategoriesDto {
  @IsUUID('4')
  property_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

export class ListRoomFacilitiesQueryDto extends V2PaginationQueryDto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateRoomFacilityV2Dto {
  @IsUUID('4')
  property_id!: string;

  @IsUUID('4')
  category_id!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateRoomFacilityV2Dto {
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ReorderRoomFacilitiesDto extends ReorderFacilityCategoriesDto {
  @IsOptional()
  @IsUUID('4')
  category_id?: string;
}

export class ListKostTypeRulesQueryDto extends V2PaginationQueryDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['global', 'kost_type'])
  scope!: 'global' | 'kost_type';

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string;

  @IsOptional()
  @IsIn(['general', 'guest', 'resident', 'other', 'special_notes'])
  rule_category?: string;
}

export class CreateKostTypeRuleDto {
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string | null;

  @IsIn(['general', 'guest', 'resident', 'other', 'special_notes'])
  rule_category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsString()
  @MaxLength(1000)
  rule_text!: string;

  @IsOptional()
  @IsBoolean()
  is_allowed?: boolean | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateKostTypeRuleDto {
  @IsOptional()
  @IsIn(['general', 'guest', 'resident', 'other', 'special_notes'])
  rule_category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rule_text?: string;

  @IsOptional()
  @IsBoolean()
  is_allowed?: boolean | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ReorderKostTypeRulesDto extends ReorderFacilityCategoriesDto {
  @IsOptional()
  @IsUUID('4')
  kost_type_id?: string | null;
}
