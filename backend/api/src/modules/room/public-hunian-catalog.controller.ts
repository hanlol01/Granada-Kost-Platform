import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { PublicHunianCatalogQueryDto } from './dto/public-hunian-catalog-query.dto';
import { PublicHunianCatalogService } from './public-hunian-catalog.service';
import { PublicRoomRateLimiterService } from './public-room-rate-limiter.service';

@Controller('public/hunian-catalog')
export class PublicHunianCatalogController {
  constructor(
    private readonly catalog: PublicHunianCatalogService,
    private readonly rateLimiter: PublicRoomRateLimiterService,
  ) {}

  @Get()
  async list(@Query() query: PublicHunianCatalogQueryDto, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip, 'hunian-catalog');
    return this.catalog.list(query);
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string, @Req() request: RequestWithCorrelationId) {
    await this.rateLimiter.assertAllowed(request.ip, 'hunian-catalog-detail');
    return this.catalog.detail(slug);
  }
}
