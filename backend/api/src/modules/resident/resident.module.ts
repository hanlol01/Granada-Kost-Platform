import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { PropertyOwnerResidentController } from './property-owner-resident.controller';
import { ResidentController } from './resident.controller';
import { ResidentRepository } from './repositories/resident.repository';
import { ResidentService } from './resident.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [ResidentController, PropertyOwnerResidentController],
  providers: [ResidentRepository, ResidentService],
  exports: [ResidentRepository, ResidentService],
})
export class ResidentModule {}
