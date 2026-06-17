import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PropertyController } from './property.controller';
import { PropertyOwnerController } from './property-owner.controller';
import { PropertyRepository } from './repositories/property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [RbacModule],
  controllers: [PropertyController, PropertyOwnerController],
  providers: [PropertyRepository, PropertyService],
  exports: [PropertyRepository, PropertyService],
})
export class PropertyModule {}
