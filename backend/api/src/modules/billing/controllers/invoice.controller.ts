import {
  Body,
  Controller,
  Get,
  GoneException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { ListInvoicesQueryDto } from '../dto/list-invoices-query.dto';
import { InvoiceService } from '../services/invoice.service';
import { scopedPropertyIds } from './billing-controller.util';

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
  async get(
    @CurrentUser() user: UserAccessContext,
    @Param('invoiceId') invoiceId: string,
    @Query('property_id') propertyId?: string,
  ) {
    if (!propertyId)
      throw new GoneException({
        code: 'PROPERTY_SCOPE_REQUIRED',
        message: 'Use the scoped W06 invoice workspace',
      });
    await this.properties.assertCanReadProperty(user, propertyId);
    const invoice = await this.invoices.get(invoiceId);
    if (invoice.propertyId !== propertyId)
      throw new GoneException({
        code: 'INVOICE_SCOPE_MISMATCH',
        message: 'Invoice is unavailable',
      });
    return invoice;
  }

  @Post()
  @RequirePermissions('billing.manage')
  async create(@CurrentUser() user: UserAccessContext, @Body() dto: CreateInvoiceDto) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    throw new GoneException({
      code: 'LEGACY_INVOICE_WRITE_DISABLED',
      message: 'Use the W06 schedule or other-charge authority',
    });
  }

  @Post(':invoiceId/issue')
  @RequirePermissions('billing.manage')
  issue() {
    throw new GoneException({
      code: 'LEGACY_INVOICE_WRITE_DISABLED',
      message: 'Invoice issue is schedule-controlled',
    });
  }

  @Post(':invoiceId/cancel')
  @RequirePermissions('billing.manage')
  cancel() {
    throw new GoneException({
      code: 'LEGACY_INVOICE_WRITE_DISABLED',
      message: 'Use the scoped W06 void command',
    });
  }
}
