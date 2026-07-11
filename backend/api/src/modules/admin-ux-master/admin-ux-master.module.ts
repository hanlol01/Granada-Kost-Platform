import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import {
  FacilityCategoryController,
  KostTypeController,
  KostTypeRuleController,
  RoomFacilityV2Controller,
} from './admin-ux-master.controller';
import { AdminUxGalleryV2Service } from './admin-ux-gallery-v2.service';
import { AdminUxRoomV2Service } from './admin-ux-room-v2.service';
import { AdminUxMasterService } from './admin-ux-master.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [
    KostTypeController,
    FacilityCategoryController,
    RoomFacilityV2Controller,
    KostTypeRuleController,
  ],
  providers: [AdminUxMasterService, AdminUxRoomV2Service, AdminUxGalleryV2Service],
  exports: [AdminUxMasterService, AdminUxRoomV2Service, AdminUxGalleryV2Service],
})
export class AdminUxMasterModule {}
