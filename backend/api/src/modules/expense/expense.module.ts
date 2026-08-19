import { Module } from '@nestjs/common';
import { AuditModule } from '../../infrastructure/audit/audit.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ExpenseController } from './controllers/expense.controller';
import { ExpenseRepository } from './repositories/expense.repository';
import { ExpenseService } from './services/expense.service';

@Module({
  imports: [AuditModule, PropertyModule, RbacModule],
  controllers: [ExpenseController],
  providers: [ExpenseRepository, ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
