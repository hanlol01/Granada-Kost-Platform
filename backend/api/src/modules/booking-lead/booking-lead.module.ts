import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { BookingLeadController } from './booking-lead.controller';
import { BookingLeadCompletionController } from './booking-lead-completion.controller';
import { BookingLeadCompletionService } from './booking-lead-completion.service';
import {
  BookingLeadHoldCommandController,
  BookingLeadHoldReadController,
} from './booking-lead-hold.controller';
import { BookingLeadHoldExpiryWorker } from './booking-lead-hold-expiry.worker';
import { BookingLeadHoldFeatureService } from './booking-lead-hold-feature.service';
import { BookingLeadHoldService } from './booking-lead-hold.service';
import { BookingLeadRateLimiterService } from './booking-lead-rate-limiter.service';
import { BookingLeadService } from './booking-lead.service';
import { PublicBookingLeadController } from './public-booking-lead.controller';
import { BookingLeadHoldRepository } from './repositories/booking-lead-hold.repository';
import { BookingLeadRepository } from './repositories/booking-lead.repository';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [
    PublicBookingLeadController,
    BookingLeadController,
    BookingLeadCompletionController,
    BookingLeadHoldCommandController,
    BookingLeadHoldReadController,
  ],
  providers: [
    BookingLeadRepository,
    BookingLeadService,
    BookingLeadCompletionService,
    BookingLeadRateLimiterService,
    BookingLeadHoldRepository,
    BookingLeadHoldFeatureService,
    BookingLeadHoldService,
    BookingLeadHoldExpiryWorker,
  ],
})
export class BookingLeadModule {}
