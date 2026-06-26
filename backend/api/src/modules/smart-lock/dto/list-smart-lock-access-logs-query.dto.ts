import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { SmartLockAccessAction } from '../types/smart-lock.types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListSmartLockAccessLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsIn([
    'lock',
    'unlock',
    'remote_unlock',
    'emergency_unlock',
    'doorbell_ring',
    'failed_attempt',
    'sync_status',
    'restrict',
    'unrestrict',
    'normal_open_mode',
    'normal_open_mode_on',
    'normal_open_mode_off',
    'credential_created',
    'credential_disabled',
    'credential_deleted',
    'pin_revealed',
  ])
  action_type?: SmartLockAccessAction;
}
