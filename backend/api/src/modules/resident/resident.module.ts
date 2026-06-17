import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { PropertyOwnerResidentController } from './property-owner-resident.controller';
import { ResidentController } from './resident.controller';
import { ResidentRepository } from './repositories/resident.repository';
import { ResidentService } from './resident.service';

@Module({
  imports: [PropertyModule],
  controllers: [ResidentController, PropertyOwnerResidentController],
  providers: [ResidentRepository, ResidentService],
  exports: [ResidentRepository, ResidentService],
})
export class ResidentModule {}
