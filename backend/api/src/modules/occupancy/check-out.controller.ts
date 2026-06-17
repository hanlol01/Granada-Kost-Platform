import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateCheckOutRequestDto } from './dto/create-check-out.dto';
import { FinalizeCheckOutDto } from './dto/finalize-check-out.dto';
import { OccupancyService } from './occupancy.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('check-outs')
export class CheckOutController {
  constructor(private readonly occupancies: OccupancyService) {}

  @Get()
  @RequirePermissions('resident.read')
  list(@CurrentUser() user: UserAccessContext) {
    return this.occupancies.listCheckOutRequests(user);
  }

  @Post()
  @RequirePermissions('checkout.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateCheckOutRequestDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.occupancies.createCheckOutRequest(user, dto, this.contextFromRequest(request));
  }

  @Post(':checkOutId/approve')
  @RequirePermissions('checkout.manage')
  approve(
    @CurrentUser() user: UserAccessContext,
    @Param('checkOutId') checkOutId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.occupancies.approveCheckOut(user, checkOutId, this.contextFromRequest(request));
  }

  @Post(':checkOutId/reject')
  @RequirePermissions('checkout.manage')
  reject(
    @CurrentUser() user: UserAccessContext,
    @Param('checkOutId') checkOutId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.occupancies.rejectCheckOut(user, checkOutId, this.contextFromRequest(request));
  }

  @Post(':checkOutId/finalize')
  @RequirePermissions('checkout.manage')
  finalize(
    @CurrentUser() user: UserAccessContext,
    @Param('checkOutId') checkOutId: string,
    @Body() dto: FinalizeCheckOutDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.occupancies.finalizeCheckOut(user, checkOutId, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
