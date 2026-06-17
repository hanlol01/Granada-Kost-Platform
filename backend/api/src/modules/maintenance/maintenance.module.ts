import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { MyWorkOrderController } from './controllers/my-work-order.controller';
import { WorkOrderController } from './controllers/work-order.controller';
import { MaintenanceMaterialRepository } from './repositories/maintenance-material.repository';
import { TechnicianProfileRepository } from './repositories/technician-profile.repository';
import { WorkOrderFileRepository } from './repositories/work-order-file.repository';
import { WorkOrderHistoryRepository } from './repositories/work-order-history.repository';
import { WorkOrderRepository } from './repositories/work-order.repository';
import { MaintenanceService } from './services/maintenance.service';
import { TechnicianService } from './services/technician.service';
import { WorkOrderService } from './services/work-order.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [WorkOrderController, MyWorkOrderController],
  providers: [
    TechnicianProfileRepository,
    WorkOrderRepository,
    WorkOrderHistoryRepository,
    WorkOrderFileRepository,
    MaintenanceMaterialRepository,
    TechnicianService,
    WorkOrderService,
    MaintenanceService,
  ],
  exports: [TechnicianService, WorkOrderService, MaintenanceService],
})
export class MaintenanceModule {}
