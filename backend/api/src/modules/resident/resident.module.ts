import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { PropertyOwnerResidentController } from './property-owner-resident.controller';
import { MyResidentContextController } from './my-resident-context.controller';
import { ResidentController } from './resident.controller';
import { ResidentRepository } from './repositories/resident.repository';
import { ResidentAccountService } from './resident-account.service';
import { ResidentService } from './resident.service';

@Module({
  imports: [FileModule, PropertyModule, RbacModule],
  controllers: [ResidentController, PropertyOwnerResidentController, MyResidentContextController],
  providers: [ResidentRepository, ResidentService, ResidentAccountService],
  exports: [ResidentRepository, ResidentService, ResidentAccountService],
})
export class ResidentModule {}
