import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { ResidentModule } from './resident.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { LeaseActivationController } from '../lease/lease-activation.controller';
import { LeaseActivationService } from '../lease/lease-activation.service';

@Module({
  imports: [ResidentModule, PropertyModule],
  controllers: [OnboardingController, LeaseActivationController],
  providers: [OnboardingService, LeaseActivationService],
})
export class OnboardingModule {}
