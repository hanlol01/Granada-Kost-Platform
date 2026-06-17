import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ComplaintCategoryController } from './controllers/complaint-category.controller';
import { ComplaintController } from './controllers/complaint.controller';
import { MyComplaintController } from './controllers/my-complaint.controller';
import { PropertyOwnerComplaintController } from './controllers/property-owner-complaint.controller';
import { ComplaintCategoryRepository } from './repositories/complaint-category.repository';
import { ComplaintFileRepository } from './repositories/complaint-file.repository';
import { ComplaintHistoryRepository } from './repositories/complaint-history.repository';
import { ComplaintRepository } from './repositories/complaint.repository';
import { ComplaintCategoryService } from './services/complaint-category.service';
import { ComplaintService } from './services/complaint.service';

@Module({
  imports: [PropertyModule, RbacModule],
  controllers: [ComplaintController, ComplaintCategoryController, MyComplaintController, PropertyOwnerComplaintController],
  providers: [
    ComplaintCategoryRepository,
    ComplaintRepository,
    ComplaintHistoryRepository,
    ComplaintFileRepository,
    ComplaintService,
    ComplaintCategoryService,
  ],
  exports: [ComplaintService, ComplaintCategoryService],
})
export class ComplaintModule {}
