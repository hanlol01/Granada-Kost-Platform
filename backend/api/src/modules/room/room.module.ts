import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { PropertyOwnerRoomController } from './property-owner-room.controller';
import { PublicHunianCatalogController } from './public-hunian-catalog.controller';
import { PublicHunianCatalogService } from './public-hunian-catalog.service';
import { PublicRoomController } from './public-room.controller';
import { PublicRoomRateLimiterService } from './public-room-rate-limiter.service';
import { PublicRoomService } from './public-room.service';
import { RoomFacilityController } from './room-facility.controller';
import { RoomTypeController } from './room-type.controller';
import { RoomController } from './room.controller';
import { RoomRepository } from './repositories/room.repository';
import { RoomService } from './room.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [
    RoomController,
    RoomTypeController,
    RoomFacilityController,
    PropertyOwnerRoomController,
    PublicRoomController,
    PublicHunianCatalogController,
  ],
  providers: [RoomRepository, RoomService, PublicRoomService, PublicHunianCatalogService, PublicRoomRateLimiterService],
  exports: [RoomRepository, RoomService],
})
export class RoomModule {}
