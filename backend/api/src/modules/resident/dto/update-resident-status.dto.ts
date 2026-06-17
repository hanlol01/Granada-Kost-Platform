import { IsIn } from 'class-validator';

export class UpdateResidentStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
