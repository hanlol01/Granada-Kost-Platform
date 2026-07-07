import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { BookingLeadService } from './booking-lead.service';
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

  @Get()
  @RequirePermissions('room.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListBookingLeadsQueryDto) {
    const propertyIds = await this.scopedPropertyIds(user, query.property_id);
    return this.bookingLeads.listAdminLeads(propertyIds, query);
  }

  @Patch(':leadId/status')
  @RequirePermissions('room.manage')
  async updateStatus(
    @CurrentUser() user: UserAccessContext,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateBookingLeadStatusDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const lead = await this.bookingLeads.get(leadId);
    await this.properties.assertCanReadProperty(user, lead.propertyId);
    return this.bookingLeads.updateStatus(lead, dto.status, {
      actorUserId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    });
  }

  private async scopedPropertyIds(user: UserAccessContext, propertyId?: string): Promise<string[]> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return [propertyId];
    }
    return user.propertyIds;
  }
}
