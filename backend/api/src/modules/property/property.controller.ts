import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { AssignPropertyOwnerDto } from './dto/assign-property-owner.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { UpdatePropertyStatusDto } from './dto/update-property-status.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyService } from './property.service';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('properties')
export class PropertyController {
  constructor(private readonly properties: PropertyService) {}

  @Get()
  @RequirePermissions('property.read')
  list(@CurrentUser() user: UserAccessContext) {
    return this.properties.list(user);
  }

  @Post()
  @RequireRoles('owner')
  @RequirePermissions('property.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreatePropertyDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.create(user, dto, this.contextFromRequest(request));
  }

  @Get(':propertyId')
  @RequirePermissions('property.read')
  get(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.properties.get(user, propertyId);
  }

  @Patch(':propertyId')
  @RequirePermissions('property.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.update(user, propertyId, dto, this.contextFromRequest(request));
  }

  @Patch(':propertyId/status')
  @RequireRoles('owner')
  @RequirePermissions('property.manage')
  updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyStatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.updateStatus(user, propertyId, dto, this.contextFromRequest(request));
  }

  @Get(':propertyId/settings')
  @RequirePermissions('property.read')
  getSettings(@CurrentUser() user: UserAccessContext, @Param('propertyId') propertyId: string) {
    return this.properties.getSettings(user, propertyId);
  }

  @Patch(':propertyId/settings')
  @RequirePermissions('property.manage')
  updateSettings(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertySettingsDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.updateSettings(user, propertyId, dto, this.contextFromRequest(request));
  }

  @Post(':propertyId/owners')
  @RequireRoles('owner', 'manager')
  @RequirePermissions('property.manage')
  assignOwner(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Body() dto: AssignPropertyOwnerDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.assignOwner(user, propertyId, dto, this.contextFromRequest(request));
  }

  @Delete(':propertyId/owners/:userId')
  @RequireRoles('owner', 'manager')
  @RequirePermissions('property.manage')
  revokeOwner(
    @CurrentUser() user: UserAccessContext,
    @Param('propertyId') propertyId: string,
    @Param('userId') userId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.properties.revokeOwner(user, propertyId, userId, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
