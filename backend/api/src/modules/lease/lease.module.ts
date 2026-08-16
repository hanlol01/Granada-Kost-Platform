import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { RbacModule } from '../rbac/rbac.module';
import { LeaseCheckoutController } from './lease-checkout.controller';
import { LeaseCheckoutService } from './lease-checkout.service';
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
  controllers: [LeaseController, LeaseCheckoutController],
  providers: [
    LeaseRepository,
    LeaseFeatureService,
    LeaseService,
    LeaseCheckoutService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseBillingScheduler,
    LeaseTransferScheduler,
    LeaseRenewalScheduler,
  ],
  exports: [
    LeaseService,
    LeaseCheckoutService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseBillingScheduler,
    LeaseTransferScheduler,
    LeaseRenewalScheduler,
  ],
})
export class LeaseModule {}
