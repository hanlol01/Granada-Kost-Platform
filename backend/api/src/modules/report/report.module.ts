import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [RbacModule, PropertyModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
