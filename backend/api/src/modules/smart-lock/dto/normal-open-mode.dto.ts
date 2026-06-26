import { IsBoolean } from 'class-validator';

export class NormalOpenModeDto {
  @IsBoolean()
  enabled!: boolean;
}
