import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import {
  MyPropertyOwnerController,
  PropertyOwnerManagementController,
} from './property-owner-management.controller';
import { PropertyOwnerManagementService } from './property-owner-management.service';

@Module({
  imports: [RbacModule],
  controllers: [PropertyOwnerManagementController, MyPropertyOwnerController],
  providers: [PropertyOwnerManagementService],
  exports: [PropertyOwnerManagementService],
})
export class PropertyOwnerManagementModule {}
