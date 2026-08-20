import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ParkingController } from './controllers/parking.controller';
import { ParkingSlotRepository } from './repositories/parking-slot.repository';
import { ParkingAssignmentHistoryRepository } from './repositories/parking-assignment-history.repository';
import { ParkingZoneRepository } from './repositories/parking-zone.repository';
import { ParkingService } from './services/parking.service';

@Module({
  imports: [PropertyModule, RbacModule, VehicleModule],
  controllers: [ParkingController],
  providers: [
    ParkingZoneRepository,
    ParkingSlotRepository,
    ParkingAssignmentHistoryRepository,
    ParkingService,
  ],
  exports: [
    ParkingZoneRepository,
    ParkingSlotRepository,
    ParkingAssignmentHistoryRepository,
    ParkingService,
  ],
})
export class ParkingModule {}
