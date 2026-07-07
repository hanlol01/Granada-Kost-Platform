import { Body, Controller, Post, Req } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { BookingLeadRateLimiterService } from './booking-lead-rate-limiter.service';
import { BookingLeadService } from './booking-lead.service';
import { CreatePublicBookingLeadDto } from './dto/create-public-booking-lead.dto';

@Controller('public/booking-leads')
export class PublicBookingLeadController {
  constructor(
    private readonly bookingLeads: BookingLeadService,
    private readonly rateLimiter: BookingLeadRateLimiterService,
  ) {}

  @Post()
  async create(@Body() dto: CreatePublicBookingLeadDto, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertPublicCreateAllowed(request.ip);
    return this.bookingLeads.createPublicLead(dto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    });
  }
}
