import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { CheckInController } from './check-in.controller';
import { CheckOutController } from './check-out.controller';
import { OccupancyController } from './occupancy.controller';
import { RoomOccupancyController } from './room-occupancy.controller';
import { PropertyOwnerOccupancyController } from './property-owner-occupancy.controller';
import { OccupancyService } from './occupancy.service';
import { OccupancyRepository } from './repositories/occupancy.repository';

@Module({
  imports: [PropertyModule],
  controllers: [
    OccupancyController,
    RoomOccupancyController,
    CheckInController,
    CheckOutController,
    PropertyOwnerOccupancyController,
  ],
  providers: [OccupancyRepository, OccupancyService],
})
export class OccupancyModule {}
