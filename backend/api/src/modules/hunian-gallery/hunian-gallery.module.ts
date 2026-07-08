import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { FileModule } from '../file/file.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { HunianGalleryController } from './hunian-gallery.controller';
import { HunianGalleryRateLimiterService } from './hunian-gallery-rate-limiter.service';
import { HunianGalleryRepository } from './hunian-gallery.repository';
import { HunianGalleryService } from './hunian-gallery.service';
import { PublicHunianGalleryController } from './public-hunian-gallery.controller';

@Module({
  imports: [FileModule, PropertyModule, RbacModule, RedisModule],
  controllers: [HunianGalleryController, PublicHunianGalleryController],
  providers: [HunianGalleryRepository, HunianGalleryService, HunianGalleryRateLimiterService],
  exports: [HunianGalleryRepository, HunianGalleryService],
})
export class HunianGalleryModule {}
