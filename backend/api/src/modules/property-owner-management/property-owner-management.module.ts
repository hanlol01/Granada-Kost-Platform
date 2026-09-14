import { Module } from '@nestjs/common';
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

@Module({
  imports: [RbacModule],
  controllers: [
    PropertyOwnerManagementController,
    PropertyOwnerReportController,
    MyPropertyOwnerController,
    PropertyOwnerPortalController,
  ],
  providers: [
    PropertyOwnerManagementService,
    PropertyOwnerPortalService,
    PropertyOwnerReportService,
  ],
  exports: [PropertyOwnerManagementService],
})
export class PropertyOwnerManagementModule {}
