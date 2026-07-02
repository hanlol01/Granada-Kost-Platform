import { IsIn, IsUUID } from 'class-validator';
import { FILE_PURPOSES } from '../constants/file.constants';
import type { FilePurpose } from '../types/file.types';

export class UploadFileDto {
  @IsUUID('4')
  property_id!: string;

  @IsIn(FILE_PURPOSES)
  file_purpose!: FilePurpose;
}
