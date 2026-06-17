import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';

@Global()
@Module({
  providers: [AuditRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
