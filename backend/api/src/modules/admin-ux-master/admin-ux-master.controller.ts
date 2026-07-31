import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import {
  CreateFacilityCategoryDto,
  CreateKostTypeRuleDto,
  CreateRoomFacilityV2Dto,
  ListFacilityCategoriesQueryDto,
  ListKostTypeRulesQueryDto,
  ListKostTypesQueryDto,
  ListRoomFacilitiesQueryDto,
  ReorderFacilityCategoriesDto,
  ReorderKostTypeRulesDto,
  ReorderRoomFacilitiesDto,
  ReplaceKostTypeFacilitiesDto,
  UpdateFacilityCategoryDto,
  UpdateKostTypeRuleDto,
  UpdateRoomFacilityV2Dto,
} from './admin-ux-master.dto';
import { AdminUxMasterService } from './admin-ux-master.service';

function context(request: RequestWithCorrelationId) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('kost-types')
export class KostTypeController {
  constructor(private readonly master: AdminUxMasterService) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListKostTypesQueryDto) {
    return this.master.listKostTypes(user, query);
  }

  @Get(':id')
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  get(@CurrentUser() user: UserAccessContext, @Param('id') id: string) {
    return this.master.getKostType(user, id);
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: unknown,
    @Req() request: RequestWithCorrelationId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.master.createKostType(user, dto, context(request), idempotencyKey);
  }

  @Patch(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Body() dto: unknown,
    @Req() request: RequestWithCorrelationId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.master.updateKostType(user, id, dto, context(request), idempotencyKey);
  }

  @Delete(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  delete(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.deleteKostType(user, id, context(request));
  }

  @Put(':id/facilities')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  replaceFacilities(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Body() dto: ReplaceKostTypeFacilitiesDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.replaceKostTypeFacilities(user, id, dto, context(request));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('facility-categories')
export class FacilityCategoryController {
  constructor(private readonly master: AdminUxMasterService) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListFacilityCategoriesQueryDto) {
    return this.master.listFacilityCategories(user, query);
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateFacilityCategoryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.createFacilityCategory(user, dto, context(request));
  }

  @Put('reorder')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  reorder(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: ReorderFacilityCategoriesDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.reorderFacilityCategories(user, dto, context(request));
  }

  @Patch(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateFacilityCategoryDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.updateFacilityCategory(user, id, dto, context(request));
  }

  @Delete(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  delete(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.deleteFacilityCategory(user, id, context(request));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('room-facilities')
export class RoomFacilityV2Controller {
  constructor(private readonly master: AdminUxMasterService) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListRoomFacilitiesQueryDto) {
    return this.master.listRoomFacilities(user, query);
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateRoomFacilityV2Dto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.createRoomFacility(user, dto, context(request));
  }

  @Put('reorder')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  reorder(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: ReorderRoomFacilitiesDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.reorderRoomFacilities(user, dto, context(request));
  }

  @Patch(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateRoomFacilityV2Dto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.updateRoomFacility(user, id, dto, context(request));
  }

  @Delete(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  delete(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.deleteRoomFacility(user, id, context(request));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('kost-type-rules')
export class KostTypeRuleController {
  constructor(private readonly master: AdminUxMasterService) {}

  @Get()
  @RequireRoles('owner', 'manager', 'admin', 'property_owner')
  @RequirePermissions('room.read')
  list(@CurrentUser() user: UserAccessContext, @Query() query: ListKostTypeRulesQueryDto) {
    return this.master.listRules(user, query);
  }

  @Post()
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateKostTypeRuleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.createRule(user, dto, context(request));
  }

  @Put('reorder')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  reorder(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: ReorderKostTypeRulesDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.reorderRules(user, dto, context(request));
  }

  @Patch(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  update(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateKostTypeRuleDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.updateRule(user, id, dto, context(request));
  }

  @Delete(':id')
  @RequireRoles('owner', 'manager', 'admin')
  @RequirePermissions('room.manage')
  delete(
    @CurrentUser() user: UserAccessContext,
    @Param('id') id: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.master.deleteRule(user, id, context(request));
  }
}
