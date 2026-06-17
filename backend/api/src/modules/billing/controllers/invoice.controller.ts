import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { ListInvoicesQueryDto } from '../dto/list-invoices-query.dto';
import { InvoiceService } from '../services/invoice.service';
import { auditContext, scopedPropertyIds } from './billing-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly properties: PropertyService,
  ) {}

  @Get()
  @RequirePermissions('billing.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListInvoicesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    if (propertyIds.length === 1) {
      return this.invoices.list(propertyIds[0], query.status, query.limit, query.offset);
    }
    return this.invoices.listForProperties(propertyIds, query.status, query.limit, query.offset);
  }

  @Get(':invoiceId')
  @RequirePermissions('billing.read')
  async get(@CurrentUser() user: UserAccessContext, @Param('invoiceId') invoiceId: string) {
    const invoice = await this.invoices.get(invoiceId);
    await this.properties.assertCanReadProperty(user, invoice.propertyId);
    return invoice;
  }

  @Post()
  @RequirePermissions('billing.manage')
  async create(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: CreateInvoiceDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    return this.invoices.createInvoice(
      {
        propertyId: dto.property_id,
        residentId: dto.resident_id,
        roomId: dto.room_id,
        occupancyId: dto.occupancy_id,
        billingPeriodId: dto.billing_period_id,
        invoiceCode: dto.invoice_code,
        subtotalAmount: dto.subtotal_amount,
        dueDate: dto.due_date,
        snapshotPeriodKey: dto.snapshot_period_key,
        snapshotPeriodStartDate: dto.snapshot_period_start_date,
        snapshotPeriodEndDate: dto.snapshot_period_end_date,
        snapshotRoomNumber: dto.snapshot_room_number,
        snapshotResidentName: dto.snapshot_resident_name,
        snapshotMonthlyPrice: dto.snapshot_monthly_price,
        createdByUserId: user.id,
      },
      auditContext(user, request),
    );
  }

  @Post(':invoiceId/issue')
  @RequirePermissions('billing.manage')
  async issue(@CurrentUser() user: UserAccessContext, @Param('invoiceId') invoiceId: string, @Req() request: RequestWithCorrelationId) {
    const invoice = await this.invoices.get(invoiceId);
    await this.properties.assertCanReadProperty(user, invoice.propertyId);
    return this.invoices.issueInvoice(invoiceId, auditContext(user, request));
  }

  @Post(':invoiceId/cancel')
  @RequirePermissions('billing.manage')
  async cancel(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: CancelInvoiceDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const invoice = await this.invoices.get(invoiceId);
    await this.properties.assertCanReadProperty(user, invoice.propertyId);
    return this.invoices.cancelInvoice(invoiceId, dto.reason, auditContext(user, request));
  }
}
