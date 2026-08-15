import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  AssignOwnerBuildingDto,
  AssignOwnerRoomsDto,
  CreatePropertyOwnerDto,
  ListPropertyOwnersQueryDto,
  PropertyOwnerAssetOptionsQueryDto,
  PropertyOwnerPropertyQueryDto,
  ReleaseOwnerAssignmentDto,
  ReleaseOwnerAssignmentsDto,
  ResetPropertyOwnerPasswordDto,
  UpdatePropertyOwnerDto,
} from './dto/property-owner-management.dto';
import { PropertyOwnerManagementService } from './property-owner-management.service';

function auditContext(request: RequestWithCorrelationId) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@RequirePermissions('property_owner.manage')
@Controller('admin/property-owners')
export class PropertyOwnerManagementController {
  constructor(private readonly owners: PropertyOwnerManagementService) {}

  @Get()
  list(@CurrentUser() actor: UserAccessContext, @Query() query: ListPropertyOwnersQueryDto) {
    return this.owners.list(actor, query);
  }

  @Get('asset-options')
  assetOptions(
    @CurrentUser() actor: UserAccessContext,
    @Query() query: PropertyOwnerAssetOptionsQueryDto,
  ) {
    return this.owners.assetOptions(actor, query.property_id, query.effective_date);
  }

  @Post()
  create(
    @CurrentUser() actor: UserAccessContext,
    @Body() dto: CreatePropertyOwnerDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.create(actor, dto, idempotencyKey, auditContext(request));
  }

  @Get(':ownerId')
  get(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Query() query: PropertyOwnerPropertyQueryDto,
  ) {
    return this.owners.get(actor, ownerId, query.property_id);
  }

  @Patch(':ownerId')
  update(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: UpdatePropertyOwnerDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.update(actor, ownerId, dto, idempotencyKey, auditContext(request));
  }

  @Post(':ownerId/reset-password')
  resetPassword(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: ResetPropertyOwnerPasswordDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.resetPassword(actor, ownerId, dto, idempotencyKey, auditContext(request));
  }

  @Delete(':ownerId')
  archive(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Query() query: PropertyOwnerPropertyQueryDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.archive(
      actor,
      ownerId,
      query.property_id,
      idempotencyKey,
      auditContext(request),
    );
  }

  @Post(':ownerId/building-assignments')
  assignBuilding(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: AssignOwnerBuildingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.assignBuilding(actor, ownerId, dto, idempotencyKey, auditContext(request));
  }

  @Post(':ownerId/room-assignments')
  assignRooms(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: AssignOwnerRoomsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.assignRooms(actor, ownerId, dto, idempotencyKey, auditContext(request));
  }

  @Post(':ownerId/building-assignments/:assignmentId/release')
  releaseBuilding(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Body() dto: ReleaseOwnerAssignmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.releaseAssignment(
      actor,
      ownerId,
      'building',
      assignmentId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
  }

  @Post(':ownerId/room-assignments/:assignmentId/release')
  releaseRoom(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' })) assignmentId: string,
    @Body() dto: ReleaseOwnerAssignmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.releaseAssignment(
      actor,
      ownerId,
      'room',
      assignmentId,
      dto,
      idempotencyKey,
      auditContext(request),
    );
  }

  @Post(':ownerId/building-assignments/release-batch')
  releaseBuildingBatch(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: ReleaseOwnerAssignmentsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.releaseAssignments(
      actor,
      ownerId,
      'building',
      dto,
      idempotencyKey,
      auditContext(request),
    );
  }

  @Post(':ownerId/room-assignments/release-batch')
  releaseRoomBatch(
    @CurrentUser() actor: UserAccessContext,
    @Param('ownerId', new ParseUUIDPipe({ version: '4' })) ownerId: string,
    @Body() dto: ReleaseOwnerAssignmentsDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.owners.releaseAssignments(
      actor,
      ownerId,
      'room',
      dto,
      idempotencyKey,
      auditContext(request),
    );
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('property_owner')
@RequirePermissions('property_owner.finance.read')
@Controller('my/property-owner')
export class MyPropertyOwnerController {
  constructor(private readonly owners: PropertyOwnerManagementService) {}

  @Get('workspace')
  workspace(@CurrentUser() actor: UserAccessContext) {
    return this.owners.myWorkspace(actor);
  }
}
