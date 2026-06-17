import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { auditContext } from '../../complaint/controllers/complaint-controller.util';
import { PaginationQueryDto } from '../../complaint/dto/pagination-query.dto';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { WorkOrderService } from '../services/work-order.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('technician')
@RequirePermissions('maintenance.manage')
@Controller('my/work-orders')
export class MyWorkOrderController {
  constructor(private readonly workOrders: WorkOrderService) {}

  @Get()
  list(@CurrentUser() user: UserAccessContext, @Query() query: PaginationQueryDto) {
    return this.workOrders.listAssigned(user.id, undefined, query.limit, query.offset);
  }

  @Get(':workOrderId')
  get(@CurrentUser() user: UserAccessContext, @Param('workOrderId') workOrderId: string) {
    return this.workOrders.getAssigned(workOrderId, user.id);
  }

  @Post(':workOrderId/start')
  async start(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.workOrders.getAssigned(workOrderId, user.id);
    return this.workOrders.start(workOrderId, auditContext(user, request));
  }

  @Post(':workOrderId/complete')
  async complete(
    @CurrentUser() user: UserAccessContext,
    @Param('workOrderId') workOrderId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.workOrders.getAssigned(workOrderId, user.id);
    return this.workOrders.complete(workOrderId, auditContext(user, request));
  }
}
