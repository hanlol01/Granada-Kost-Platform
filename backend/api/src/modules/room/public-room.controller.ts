import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { PublicRoomAvailabilityQueryDto } from './dto/public-room-query.dto';
import { PublicRoomRateLimiterService } from './public-room-rate-limiter.service';
import { PublicRoomService } from './public-room.service';

@Controller('public/rooms')
export class PublicRoomController {
  constructor(
    private readonly publicRooms: PublicRoomService,
    private readonly rateLimiter: PublicRoomRateLimiterService,
  ) {}

  @Get('availability')
  async availability(@Query() query: PublicRoomAvailabilityQueryDto, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip, 'availability');
    return this.publicRooms.availability(query);
  }

  @Get('summary')
  async summary(@Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip, 'summary');
    return this.publicRooms.summary();
  }

  @Get('groups/:groupKey')
  async groupDetail(@Param('groupKey') groupKey: string, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip, 'group-detail');
    return this.publicRooms.groupDetail(groupKey);
  }
}
