import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { auditContext, scopedPropertyIds } from '../../complaint/controllers/complaint-controller.util';
import { AssignWorkOrderDto } from '../dto/assign-work-order.dto';
import { CancelWorkOrderDto } from '../dto/cancel-work-order.dto';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { ListWorkOrdersQueryDto } from '../dto/list-work-orders-query.dto';
import { ReworkWorkOrderDto } from '../dto/rework-work-order.dto';
import { WorkOrderService } from '../services/work-order.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('maintenance.manage')
@Controller('work-orders')
export class WorkOrderController {
  constructor(
    private readonly workOrders: WorkOrderService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListWorkOrdersQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const result = await Promise.all(
      propertyIds.map((propertyId) => this.workOrders.list(propertyId, query.status, query.limit, query.offset)),
    );
    return result.flat();
  }

  @Get(':workOrderId')
  async get(@CurrentUser() user: UserAccessContext, @Param('workOrderId') workOrderId: string) {
    const workOrder = await this.workOrders.get(workOrderId);
    await this.properties.assertCanReadProperty(user, workOrder.propertyId);
    return workOrder;
  }

  @Post()
  async create(@CurrentUser() user: UserAccessContext, @Body() dto: CreateWorkOrderDto, @Req() request: RequestWithCorrelationId) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.workOrders.createWorkOrder(
      {
        propertyId: dto.property_id,
        roomId: dto.room_id,
        complaintId: dto.complaint_id,
        workOrderCode: dto.work_order_code,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
  }

  @Post(':workOrderId/assign')
  async assign(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: AssignWorkOrderDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const workOrder = await this.workOrders.get(workOrderId);
    await this.properties.assertCanReadProperty(user, workOrder.propertyId);
    return this.workOrders.assign(workOrderId, dto.assigned_to_user_id, auditContext(user, request));
  }

  @Post(':workOrderId/verify')
  async verify(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    const workOrder = await this.workOrders.get(workOrderId);
    await this.properties.assertCanReadProperty(user, workOrder.propertyId);
    return this.workOrders.verify(workOrderId, auditContext(user, request));
  }

  @Post(':workOrderId/rework')
  async rework(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: ReworkWorkOrderDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const workOrder = await this.workOrders.get(workOrderId);
    await this.properties.assertCanReadProperty(user, workOrder.propertyId);
    return this.workOrders.rework(workOrderId, dto.reason, auditContext(user, request));
  }

  @Post(':workOrderId/cancel')
  async cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Body() dto: CancelWorkOrderDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const workOrder = await this.workOrders.get(workOrderId);
    await this.properties.assertCanReadProperty(user, workOrder.propertyId);
    return this.workOrders.cancel(workOrderId, dto.reason, auditContext(user, request));
  }
}
