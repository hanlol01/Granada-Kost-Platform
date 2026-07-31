import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import {
  FacilityCategoryController,
  KostTypeContentController,
  KostTypeController,
  KostTypeRuleController,
  PropertyPolicyDocumentController,
  RoomFacilityV2Controller,
} from './admin-ux-master.controller';
import { AdminUxGalleryV2Service } from './admin-ux-gallery-v2.service';
import { AdminUxContentPublicationService } from './admin-ux-content-publication.service';
import { AdminUxRoomV2Service } from './admin-ux-room-v2.service';
import { AdminUxRoomDetailService } from './admin-ux-room-detail.service';
import { AdminUxMasterService } from './admin-ux-master.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [
    KostTypeController,
    FacilityCategoryController,
    RoomFacilityV2Controller,
    KostTypeRuleController,
    KostTypeContentController,
    PropertyPolicyDocumentController,
  ],
  providers: [
    AdminUxMasterService,
    AdminUxRoomV2Service,
    AdminUxRoomDetailService,
    AdminUxGalleryV2Service,
    AdminUxContentPublicationService,
  ],
  exports: [
    AdminUxMasterService,
    AdminUxRoomV2Service,
    AdminUxRoomDetailService,
    AdminUxGalleryV2Service,
    AdminUxContentPublicationService,
  ],
})
export class AdminUxMasterModule {}
