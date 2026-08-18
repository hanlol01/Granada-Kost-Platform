import { Module } from '@nestjs/common';
import { AuditModule } from '../../infrastructure/audit/audit.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { BillingModule } from '../billing/billing.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import {
  ReminderComposerController,
  ReminderShareController,
} from './reminder-composer.controller';
import { ReminderComposerService } from './reminder-composer.service';
import { ReminderShareRateLimiterService } from './reminder-share-rate-limiter.service';
import { ReminderWorkspaceService } from './reminder-workspace.service';
import { ReminderHistoryService } from './reminder-history.service';

@Module({
  imports: [AuditModule, BillingModule, PropertyModule, RbacModule, RedisModule],
  controllers: [ReminderComposerController, ReminderShareController],
  providers: [
    ReminderComposerService,
    ReminderShareRateLimiterService,
    ReminderWorkspaceService,
    ReminderHistoryService,
  ],
})
export class ReminderModule {}
