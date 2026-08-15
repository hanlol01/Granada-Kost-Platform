import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListPropertyOwnersQueryDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class PropertyOwnerPropertyQueryDto {
  @IsUUID()
  property_id!: string;
}

export class PropertyOwnerAssetOptionsQueryDto extends PropertyOwnerPropertyQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_date?: string;
}

export class CreatePropertyOwnerDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ValidateIf((value: CreatePropertyOwnerDto) => Boolean(value.email))
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  initial_password!: string;
}

export class UpdatePropertyOwnerDto {
  @IsUUID()
  property_id!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ValidateIf((value: UpdatePropertyOwnerDto) => value.email !== undefined && value.email !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;
}

export class ResetPropertyOwnerPasswordDto {
  @IsUUID()
  property_id!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  new_password!: string;
}

export class AssignOwnerBuildingDto {
  @IsUUID()
  property_id!: string;

  @IsUUID()
  building_id!: string;

  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_from!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_until?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AssignOwnerRoomsDto {
  @IsUUID()
  property_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  room_ids!: string[];

  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_from!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_until?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReleaseOwnerAssignmentDto {
  @IsUUID()
  property_id!: string;

  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  effective_until!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReleaseOwnerAssignmentsDto extends ReleaseOwnerAssignmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  assignment_ids!: string[];
}
