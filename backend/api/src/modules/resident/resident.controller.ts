import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ListResidentsQueryDto } from './dto/list-residents-query.dto';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';
import { ResidentService } from './resident.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('residents')
export class ResidentController {
  constructor(private readonly residents: ResidentService) {}

  @Get()
  @RequirePermissions('resident.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListResidentsQueryDto) {
    return this.residents.list(user, query);
  }

  @Post()
  @RequirePermissions('resident.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateResidentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.residents.create(user, dto, this.contextFromRequest(request));
  }

  @Get(':residentId')
  @RequirePermissions('resident.read')
  get(@CurrentUser() user: UserAccessContext, @Param('residentId') residentId: string) {
    return this.residents.get(user, residentId);
  }

  @Patch(':residentId')
  @RequirePermissions('resident.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Body() dto: UpdateResidentDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.residents.update(user, residentId, dto, this.contextFromRequest(request));
  }

  @Patch(':residentId/status')
  @RequirePermissions('resident.manage')
  updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('residentId') residentId: string,
    @Body() dto: UpdateResidentStatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.residents.updateStatus(user, residentId, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
