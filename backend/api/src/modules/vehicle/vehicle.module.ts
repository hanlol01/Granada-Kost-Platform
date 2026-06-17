import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ResidentModule } from '../resident/resident.module';
import { MyVehicleController } from './controllers/my-vehicle.controller';
import { PropertyOwnerVehicleController } from './controllers/property-owner-vehicle.controller';
import { VehicleController } from './controllers/vehicle.controller';
import { VehicleFileRepository } from './repositories/vehicle-file.repository';
import { VehicleStatusHistoryRepository } from './repositories/vehicle-status-history.repository';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleService } from './services/vehicle.service';

@Module({
  imports: [PropertyModule, RbacModule, ResidentModule],
  controllers: [VehicleController, MyVehicleController, PropertyOwnerVehicleController],
  providers: [VehicleRepository, VehicleStatusHistoryRepository, VehicleFileRepository, VehicleService],
  exports: [VehicleRepository, VehicleService],
})
export class VehicleModule {}
