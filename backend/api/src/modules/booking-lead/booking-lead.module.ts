import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { BookingLeadController } from './booking-lead.controller';
import { BookingLeadRateLimiterService } from './booking-lead-rate-limiter.service';
import { BookingLeadService } from './booking-lead.service';
import { PublicBookingLeadController } from './public-booking-lead.controller';
import { BookingLeadRepository } from './repositories/booking-lead.repository';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [PublicBookingLeadController, BookingLeadController],
  providers: [BookingLeadRepository, BookingLeadService, BookingLeadRateLimiterService],
})
export class BookingLeadModule {}
