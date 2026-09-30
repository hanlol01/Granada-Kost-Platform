import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { RbacModule } from '../rbac/rbac.module';
import {
  MyPropertyOwnerController,
  PropertyOwnerManagementController,
  PropertyOwnerReportController,
} from './property-owner-management.controller';
import { PropertyOwnerPortalController } from './property-owner-portal.controller';
import { PropertyOwnerPortalService } from './property-owner-portal.service';
import { PropertyOwnerManagementService } from './property-owner-management.service';
import { PropertyOwnerReportService } from './property-owner-report.service';
import { PropertyOwnerRealizationController } from './property-owner-realization.controller';
import { PropertyOwnerRealizationService } from './property-owner-realization.service';

@Module({
  imports: [RbacModule, FileModule],
  controllers: [
    PropertyOwnerManagementController,
    PropertyOwnerReportController,
    MyPropertyOwnerController,
    PropertyOwnerPortalController,
    PropertyOwnerRealizationController,
  ],
  providers: [
    PropertyOwnerManagementService,
    PropertyOwnerPortalService,
    PropertyOwnerReportService,
    PropertyOwnerRealizationService,
  ],
  exports: [PropertyOwnerManagementService],
})
export class PropertyOwnerManagementModule {}
