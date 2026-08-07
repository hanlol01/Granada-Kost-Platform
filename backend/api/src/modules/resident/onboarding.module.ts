import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ResidentModule } from './resident.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { LeaseActivationController } from '../lease/lease-activation.controller';
import { LeaseActivationService } from '../lease/lease-activation.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ResidentModule, PropertyModule, RbacModule, BillingModule],
  controllers: [OnboardingController, LeaseActivationController],
  providers: [OnboardingService, LeaseActivationService],
})
export class OnboardingModule {}
