import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { PropertyOwnerRoomController } from './property-owner-room.controller';
import { RoomFacilityController } from './room-facility.controller';
import { RoomTypeController } from './room-type.controller';
import { RoomController } from './room.controller';
import { RoomRepository } from './repositories/room.repository';
import { RoomService } from './room.service';

@Module({
  imports: [PropertyModule],
  controllers: [
    RoomController,
    RoomTypeController,
    RoomFacilityController,
    PropertyOwnerRoomController,
  ],
  providers: [RoomRepository, RoomService],
})
export class RoomModule {}
