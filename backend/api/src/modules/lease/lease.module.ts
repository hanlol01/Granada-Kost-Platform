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
import { LeaseDataCorrectionService } from './lease-data-correction.service';
import { LeaseServicePeriodService } from './lease-service-period.service';
import { LeaseRevisionContextService } from './lease-revision-context.service';
import { LeaseRoomRecordingCorrectionService } from './lease-room-recording-correction.service';
import { LeaseSponsorshipCorrectionService } from './lease-sponsorship-correction.service';
import { LeaseCommercialModeCorrectionService } from './lease-commercial-mode-correction.service';
import { LeaseArchiveService } from './lease-archive.service';
import { LeaseArchiveController } from './lease-archive.controller';
import { LeaseArchiveRestorationService } from './lease-archive-restoration.service';
import { FileModule } from '../file/file.module';
import { LeaseArchiveFileInventoryService } from './lease-archive-file-inventory.service';
import { LeaseArchiveFilePurgeService } from './lease-archive-file-purge.service';

@Module({
  imports: [RbacModule, BillingModule, PropertyModule, FileModule],
  controllers: [
    LeaseController,
    LeaseCheckoutController,
    LeaseActivationController,
    MyLeaseExitDocumentController,
    LeaseArchiveController,
  ],
  providers: [
    LeaseRepository,
    LeaseFeatureService,
    LeaseService,
    LeaseCheckoutService,
    LeaseTransferService,
    LeaseRenewalService,
    LeaseDataCorrectionService,
    LeaseRevisionContextService,
    LeaseRoomRecordingCorrectionService,
    LeaseSponsorshipCorrectionService,
    LeaseCommercialModeCorrectionService,
    LeaseArchiveService,
    LeaseArchiveRestorationService,
    LeaseArchiveFileInventoryService,
    LeaseArchiveFilePurgeService,
    LeaseActivationService,
    LeaseCheckInService,
    LeaseServicePeriodService,
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
