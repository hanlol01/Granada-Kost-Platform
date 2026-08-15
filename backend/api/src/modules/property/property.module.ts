import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PropertyController } from './property.controller';
import { PropertyRepository } from './repositories/property.repository';
import { PropertyService } from './property.service';

@Module({
  imports: [RbacModule],
  controllers: [PropertyController],
  providers: [PropertyRepository, PropertyService],
  exports: [PropertyRepository, PropertyService],
})
export class PropertyModule {}
