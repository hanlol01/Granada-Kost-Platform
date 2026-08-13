import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import {
  MyPropertyOwnerController,
  PropertyOwnerManagementController,
} from './property-owner-management.controller';
import { PropertyOwnerPortalController } from './property-owner-portal.controller';
import { PropertyOwnerPortalService } from './property-owner-portal.service';
import { PropertyOwnerManagementService } from './property-owner-management.service';

@Module({
  imports: [RbacModule],
  controllers: [
    PropertyOwnerManagementController,
    MyPropertyOwnerController,
    PropertyOwnerPortalController,
  ],
  providers: [PropertyOwnerManagementService, PropertyOwnerPortalService],
  exports: [PropertyOwnerManagementService],
})
export class PropertyOwnerManagementModule {}
