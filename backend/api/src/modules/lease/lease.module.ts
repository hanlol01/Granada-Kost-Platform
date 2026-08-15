import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { RbacModule } from '../rbac/rbac.module';
import { LeaseController } from './lease.controller';
import { LeaseRepository } from './lease.repository';
import { LeaseBillingScheduler } from './lease-billing.scheduler';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseService } from './lease.service';
import { LeaseRenewalScheduler } from './lease-renewal.scheduler';
import { LeaseRenewalService } from './lease-renewal.service';
import { LeaseTransferScheduler } from './lease-transfer.scheduler';
import { LeaseTransferService } from './lease-transfer.service';

@Module({
  imports: [RbacModule, BillingModule],
  controllers: [LeaseController],
  providers: [
    LeaseRepository,
    LeaseFeatureService,
    LeaseService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseBillingScheduler,
    LeaseTransferScheduler,
    LeaseRenewalScheduler,
  ],
  exports: [
    LeaseService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseBillingScheduler,
    LeaseTransferScheduler,
    LeaseRenewalScheduler,
  ],
})
export class LeaseModule {}
