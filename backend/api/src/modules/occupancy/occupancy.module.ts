import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { CheckInController } from './check-in.controller';
import { CheckOutController } from './check-out.controller';
import { OccupancyController } from './occupancy.controller';
import { RoomOccupancyController } from './room-occupancy.controller';
import { OccupancyService } from './occupancy.service';
import { OccupancyRepository } from './repositories/occupancy.repository';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [
    OccupancyController,
    RoomOccupancyController,
    CheckInController,
    CheckOutController,
  ],
  providers: [OccupancyRepository, OccupancyService],
})
export class OccupancyModule {}
