import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { DocumentSettingsController } from './document-settings.controller';
import { DocumentSettingsService } from './document-settings.service';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './repositories/property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [RbacModule],
  controllers: [PropertyController, DocumentSettingsController],
  providers: [PropertyRepository, PropertyService, DocumentSettingsService],
  exports: [PropertyRepository, PropertyService],
})
export class PropertyModule {}
