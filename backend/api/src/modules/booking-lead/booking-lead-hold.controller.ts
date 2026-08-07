import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { BookingLeadHoldService } from './booking-lead-hold.service';
import { BookingLeadHoldCommandDto } from './dto/booking-lead-hold-command.dto';
import { ListBookingLeadHoldsQueryDto } from './dto/list-booking-lead-holds-query.dto';
import { BookingLeadHoldCommandResult } from './types/booking-lead-hold.types';

function requestContext(user: UserAccessContext, request: RequestWithCorrelationId) {
  return {
    actorUserId: user.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('manager', 'admin')
@Controller('booking-leads/:leadId/hold')
export class BookingLeadHoldCommandController {
  constructor(
    private readonly holds: BookingLeadHoldService,
    private readonly properties: PropertyService,
  ) {}

  @Post()
  @RequirePermissions('room.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body() dto: BookingLeadHoldCommandDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const result = await this.holds.create(
      leadId,
      dto.property_id,
      dto.room_id,
      idempotencyKey,
      requestContext(user, request),
    );
    return this.commandResponse(response, result);
  }

  @Post('release')
  @RequirePermissions('room.manage')
  async release(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body() dto: BookingLeadHoldCommandDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const result = await this.holds.release(
      leadId,
      dto.property_id,
      idempotencyKey,
      requestContext(user, request),
    );
    return this.commandResponse(response, result);
  }

  private commandResponse(response: Response, result: BookingLeadHoldCommandResult) {
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    response.status(result.status);
    return result.body;
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('manager', 'admin')
@Controller('booking-lead-holds')
export class BookingLeadHoldReadController {
  constructor(
    private readonly holds: BookingLeadHoldService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  @RequirePermissions('room.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListBookingLeadHoldsQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    return this.holds.list(query);
  }
}
