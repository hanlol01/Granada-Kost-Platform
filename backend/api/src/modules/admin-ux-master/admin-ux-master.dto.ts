import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMinSize,
  IsDefined,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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
  @Matches(/\S/)
  name!: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
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

  @IsInt()
  @Min(0)
  monthly_price!: number;

  @IsInt()
  @Min(0)
  yearly_price!: number;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effective_date!: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsIn(['annual', 'two_month_installments'], { each: true })
  payment_schedules?: Array<'annual' | 'two_month_installments'>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  security_deposit_months?: number;

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
  @IsUUID('4')
  property_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
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
  @IsInt()
  @Min(1)
  room_size_m2?: number;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsIn(['annual', 'two_month_installments'], { each: true })
  payment_schedules?: Array<'annual' | 'two_month_installments'>;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthly_price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearly_price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  security_deposit_months?: number;

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

export class CategoryContentFacilityItemDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsString()
  @MaxLength(120)
  @Matches(/\S/)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  public_description?: string | null;

  @IsInt()
  @Min(0)
  sort_order!: number;

  @IsIn(['active', 'archived'])
  content_state!: 'active' | 'archived';

  @IsBoolean()
  public_visible!: boolean;
}

export class ReplaceCategoryFacilitiesDto {
  @IsUUID('4')
  property_id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryContentFacilityItemDto)
  items!: CategoryContentFacilityItemDto[];
}

export class PublishCategoryContentDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['facilities', 'gallery'])
  content_type!: 'facilities' | 'gallery';

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effective_date!: string;
}

export class UnpublishCategoryContentDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(['facilities', 'gallery'])
  content_type!: 'facilities' | 'gallery';
}

export class RestoreCategoryContentDto {
  @IsUUID('4')
  property_id!: string;

  @IsUUID('4')
  version_id!: string;
}

export class PublicTermsContentDto {
  @IsString()
  @MaxLength(2000)
  @Matches(/\S/)
  pricing_explanation!: string;

  @IsString()
  @MaxLength(300)
  @Matches(/\S/)
  minimum_lease_term!: string;

  @IsString()
  @MaxLength(2000)
  @Matches(/\S/)
  dp_explanation!: string;

  @IsString()
  @MaxLength(2000)
  @Matches(/\S/)
  security_deposit_explanation!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(300, { each: true })
  manual_payment_methods!: string[];

  @IsArray()
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  @MaxLength(500, { each: true })
  house_rules!: string[];

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  visitor_hours!: string;

  @IsString()
  @MaxLength(500)
  @Matches(/\S/)
  contact_information!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['rukost', 'apartkost'], { each: true })
  category_applicability!: Array<'rukost' | 'apartkost'>;
}

export class SavePropertyPolicyDraftDto {
  @IsUUID('4')
  property_id!: string;

  @IsString()
  @MaxLength(5000)
  internal_operating_policy!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PublicTermsContentDto)
  public_content!: PublicTermsContentDto;
}

export class PublishPropertyPolicyDto {
  @IsUUID('4')
  property_id!: string;

  @IsDateString()
  effective_date!: string;
}

export class UnpublishPropertyPolicyDto {
  @IsUUID('4')
  property_id!: string;
}

export class RestorePropertyPolicyDto {
  @IsUUID('4')
  property_id!: string;

  @IsUUID('4')
  version_id!: string;
}
