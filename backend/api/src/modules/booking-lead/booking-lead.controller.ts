import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { acceptsAdminUxV2, v2Data, v2List } from '../../shared/admin-ux-v2';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { BookingLeadService } from './booking-lead.service';
import { CreateAdminBookingLeadDto } from './dto/create-admin-booking-lead.dto';
import { ListBookingLeadsQueryDto } from './dto/list-booking-leads-query.dto';
import { UpdateBookingLeadStatusDto } from './dto/update-booking-lead-status.dto';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('manager', 'admin')
@Controller('booking-leads')
export class BookingLeadController {
  constructor(
    private readonly bookingLeads: BookingLeadService,
    private readonly properties: PropertyService,
  ) {}

  @Post()
  @RequirePermissions('room.manage')
  async createAdmin(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateAdminBookingLeadDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.bookingLeads.createAdminLead(dto, {
      actorUserId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    });
  }

  @Get()
  @RequirePermissions('room.read')
  async list(
    @CurrentUser() user: UserAccessContext,
    @Query() query: ListBookingLeadsQueryDto,
    @Headers('accept') accept: string | string[] | undefined,
  ) {
    const propertyIds = await this.scopedPropertyIds(user, query.property_id);
    if (acceptsAdminUxV2(accept)) {
      const page = await this.bookingLeads.listAdminLeadPage(propertyIds, query);
      return v2List(page.data, page.limit, page.offset, page.total);
    }
    return this.bookingLeads.listAdminLeads(propertyIds, query);
  }

  @Patch(':leadId/status')
  @RequirePermissions('room.manage')
  async updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateBookingLeadStatusDto,
    @Req() request: RequestWithCorrelationId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('accept') accept: string | string[] | undefined,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const lead = await this.bookingLeads.getForProperty(leadId, dto.property_id);
    const updated = await this.bookingLeads.updateStatusCommand(lead, dto.status, idempotencyKey, {
      actorUserId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    });
    return acceptsAdminUxV2(accept) ? v2Data(updated) : updated;
  }

  private async scopedPropertyIds(user: UserAccessContext, propertyId?: string): Promise<string[]> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return [propertyId];
    }
    return user.propertyIds;
  }
}
