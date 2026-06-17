import { Module } from '@nestjs/common';
import { PropertyController } from './property.controller';
import { PropertyOwnerController } from './property-owner.controller';
import { PropertyRepository } from './repositories/property.repository';
import { PropertyService } from './property.service';

@Module({
  controllers: [PropertyController, PropertyOwnerController],
  providers: [PropertyRepository, PropertyService],
  exports: [PropertyRepository, PropertyService],
})
export class PropertyModule {}
