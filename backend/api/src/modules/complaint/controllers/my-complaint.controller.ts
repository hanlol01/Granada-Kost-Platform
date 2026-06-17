import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateMyComplaintDto } from '../dto/create-my-complaint.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { ComplaintCategoryService } from '../services/complaint-category.service';
import { ComplaintService } from '../services/complaint.service';
import { auditContext } from './complaint-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('resident')
@Controller('my/complaints')
export class MyComplaintController {
  constructor(
    private readonly complaints: ComplaintService,
    private readonly categories: ComplaintCategoryService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateMyComplaintDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const active = await this.complaints.activeResidentContextForUser(user.id);
    const category = await this.categories.get(dto.category_id);
    if (category.propertyId !== active.propertyId || !category.isActive) {
      throw new BadRequestException({ code: 'COMPLAINT_CATEGORY_INVALID', message: 'Complaint category is not available' });
    }
    const roomId = dto.location_note && !dto.room_id ? undefined : (dto.room_id ?? active.roomId);
    return this.complaints.createComplaint(
      {
        propertyId: active.propertyId,
        residentId: active.residentId,
        roomId,
        categoryId: dto.category_id,
        complaintCode: await this.complaints.generateCode('Granada Student House', active.propertyId),
        title: dto.title,
        description: dto.description,
        priority: category.defaultPriority,
        locationNote: dto.location_note,
        snapshotRoomNumber: roomId ? active.roomNumber : undefined,
        snapshotResidentName: active.residentName,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
  }

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: PaginationQueryDto) {
    return this.complaints.listForUser(user.id, query.limit, query.offset);
  }

  @Get(':complaintId')
  get(@CurrentUser() user: UserAccessContext, @Param('complaintId') complaintId: string) {
    return this.complaints.getForUser(complaintId, user.id);
  }
}
