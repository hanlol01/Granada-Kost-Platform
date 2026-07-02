import { IsBoolean, IsOptional } from 'class-validator';

export class FileQueryDto {
  @IsOptional()
  @IsBoolean()
  download?: boolean;
}
