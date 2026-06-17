import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { ParkingController } from './controllers/parking.controller';
import { ParkingSlotRepository } from './repositories/parking-slot.repository';
import { ParkingZoneRepository } from './repositories/parking-zone.repository';
import { ParkingService } from './services/parking.service';

@Module({
  imports: [PropertyModule, RbacModule, VehicleModule],
  controllers: [ParkingController],
  providers: [ParkingZoneRepository, ParkingSlotRepository, ParkingService],
  exports: [ParkingZoneRepository, ParkingSlotRepository, ParkingService],
})
export class ParkingModule {}
