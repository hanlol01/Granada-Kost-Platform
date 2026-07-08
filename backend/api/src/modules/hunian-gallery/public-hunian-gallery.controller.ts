import { Controller, Get, Header, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { HunianGalleryRateLimiterService } from './hunian-gallery-rate-limiter.service';
import { HunianGalleryService } from './hunian-gallery.service';

@Controller('public/hunian-gallery')
export class PublicHunianGalleryController {
  constructor(
    private readonly gallery: HunianGalleryService,
    private readonly rateLimiter: HunianGalleryRateLimiterService,
  ) {}

  @Get(':imageId/content')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Req() request: RequestWithCorrelationId,
    @Res() response: Response,
  ) {
    await this.rateLimiter.assertAllowed(request.ip, 'public-content');
    const { record, buffer } = await this.gallery.readPublicContent(imageId);
    response.setHeader('Content-Type', record.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('Content-Disposition', 'inline');
    response.send(buffer);
  }
}
