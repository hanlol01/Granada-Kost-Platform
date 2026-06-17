import { IsIn } from 'class-validator';

export class UpdatePropertyStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
