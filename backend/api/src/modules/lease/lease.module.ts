import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { LeaseController } from './lease.controller';
import { LeaseRepository } from './lease.repository';
import { LeaseService } from './lease.service';

@Module({
  imports: [RbacModule],
  controllers: [LeaseController],
  providers: [LeaseRepository, LeaseService],
  exports: [LeaseService],
})
export class LeaseModule {}
