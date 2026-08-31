import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { LeaseCheckoutController } from './lease-checkout.controller';
import { LeaseActivationController } from './lease-activation.controller';
import { LeaseActivationScheduler } from './lease-activation.scheduler';
import { LeaseActivationService } from './lease-activation.service';
import { LeaseCheckInService } from './lease-check-in.service';
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
import { MyLeaseExitDocumentController } from './my-lease-exit-document.controller';

@Module({
  imports: [RbacModule, BillingModule, PropertyModule],
  controllers: [
    LeaseController,
    LeaseCheckoutController,
    LeaseActivationController,
    MyLeaseExitDocumentController,
  ],
  providers: [
    LeaseRepository,
    LeaseFeatureService,
    LeaseService,
    LeaseCheckoutService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseActivationService,
    LeaseCheckInService,
    LeaseActivationScheduler,
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
