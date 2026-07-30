import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { DomainEvidenceRepository } from './domain-evidence.repository';

@Global()
@Module({
  providers: [AuditRepository, DomainEvidenceRepository],
  exports: [AuditRepository, DomainEvidenceRepository],
})
export class AuditModule {}
