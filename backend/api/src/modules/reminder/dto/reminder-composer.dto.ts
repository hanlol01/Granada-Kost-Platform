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
  Length,
  Max,
  Min,
} from 'class-validator';

export class ReminderPropertyQueryDto {
  @IsUUID()
  property_id!: string;
}

export class ReminderWorkspaceQueryDto extends ReminderPropertyQueryDto {}

export class CreateReminderTemplateDto extends ReminderPropertyQueryDto {
  @IsString()
  @Length(1, 500)
  title_template!: string;

  @IsString()
  @Length(1, 8000)
  body_template!: string;
}

export class CurrentMonthReminderPreviewDto extends ReminderPropertyQueryDto {}

export class ResidentReminderPreviewDto extends ReminderPropertyQueryDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  invoice_ids!: string[];
}

export class ReminderHandoffDto extends ResidentReminderPreviewDto {
  @IsOptional()
  @IsIn(['whatsapp', 'email'])
  channel?: 'whatsapp' | 'email';
}

export class CreateReminderAttemptDto extends ResidentReminderPreviewDto {
  @IsIn(['whatsapp_manual', 'manual'])
  channel!: 'whatsapp_manual' | 'manual';

  @IsIn(['previewed', 'external_opened', 'manual_sent', 'failed'])
  outcome_status!: 'previewed' | 'external_opened' | 'manual_sent' | 'failed';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  outcome_note?: string;
}

export class ReminderAttemptQueryDto extends ReminderPropertyQueryDto {
  @IsOptional()
  @IsIn(['whatsapp_manual', 'manual'])
  channel?: 'whatsapp_manual' | 'manual';

  @IsOptional()
  @IsIn(['previewed', 'external_opened', 'manual_sent', 'failed'])
  outcome_status?: 'previewed' | 'external_opened' | 'manual_sent' | 'failed';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  include_archived?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(10, 40)
  from?: string;

  @IsOptional()
  @IsString()
  @Length(10, 40)
  to?: string;

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
