import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { LeaseController } from './lease.controller';
import { LeaseRepository } from './lease.repository';
import { LeaseBillingScheduler } from './lease-billing.scheduler';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseService } from './lease.service';
import { LeaseTransferService } from './lease-transfer.service';

@Module({
  imports: [RbacModule],
  controllers: [LeaseController],
  providers: [
    LeaseRepository,
    LeaseFeatureService,
    LeaseService,
    LeaseTransferService,
    LeaseBillingScheduler,
  ],
  exports: [LeaseService, LeaseTransferService, LeaseBillingScheduler],
})
export class LeaseModule {}
