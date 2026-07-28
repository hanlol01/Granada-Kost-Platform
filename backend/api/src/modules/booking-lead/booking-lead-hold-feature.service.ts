import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BookingLeadHoldRepository } from './repositories/booking-lead-hold.repository';

@Injectable()
export class BookingLeadHoldFeatureService {
  constructor(private readonly holds: BookingLeadHoldRepository) {}

  async assertCreateEnabled(propertyId: string, client?: PoolClient): Promise<void> {
    const flags = await this.holds.readFeatureFlags(propertyId, client);
    if (flags.adminUxRead !== true || flags.bookingHoldWrite !== true) {
      throw new ForbiddenException({
        code: 'BOOKING_HOLD_WRITE_DISABLED',
        message: 'Booking lead room hold creation is not enabled for this property',
      });
    }
  }
}
