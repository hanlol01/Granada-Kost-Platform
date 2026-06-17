import { Module } from '@nestjs/common';
import { AuthAuditRepository } from './audit/auth-audit.repository';
import { IamRepository } from './repositories/iam.repository';

@Module({
  providers: [IamRepository, AuthAuditRepository],
  exports: [IamRepository, AuthAuditRepository],
})
export class IamModule {}
