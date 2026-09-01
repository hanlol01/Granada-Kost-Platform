import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { MyResidentContextController } from './my-resident-context.controller';
import { ResidentController } from './resident.controller';
import { ResidentRepository } from './repositories/resident.repository';
import { ResidentAccountService } from './resident-account.service';
import { ResidentService } from './resident.service';
import { UniversityRepository } from './repositories/university.repository';
import { UniversityService } from './university.service';

@Module({
  imports: [FileModule, PropertyModule, RbacModule],
  controllers: [ResidentController, MyResidentContextController],
  providers: [
    ResidentRepository,
    ResidentService,
    ResidentAccountService,
    UniversityRepository,
    UniversityService,
  ],
  exports: [
    ResidentRepository,
    ResidentService,
    ResidentAccountService,
    UniversityRepository,
    UniversityService,
  ],
})
export class ResidentModule {}
