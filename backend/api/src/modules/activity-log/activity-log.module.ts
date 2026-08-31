import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';

@Module({
  imports: [RbacModule],
  controllers: [ActivityLogController],
  providers: [ActivityLogService],
})
export class ActivityLogModule {}
