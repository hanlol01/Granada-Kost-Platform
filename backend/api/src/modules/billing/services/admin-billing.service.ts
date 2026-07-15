import { BadRequestException, Injectable } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { ListAdminInvoicesQueryDto } from '../dto/list-admin-invoices-query.dto';
import { ListAdminPaymentsQueryDto } from '../dto/list-admin-payments-query.dto';
import { AdminBillingRepository } from '../repositories/admin-billing.repository';

type PageMeta = { limit: number; offset: number; total: number };

@Injectable()
export class AdminBillingService {
  constructor(
    private readonly billing: AdminBillingRepository,
    private readonly properties: PropertyService,
  ) {}

  async listInvoices(user: UserAccessContext, query: ListAdminInvoicesQueryDto) {
    const propertyId = await this.authorizeProperty(user, query.property_id);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const result = await this.billing.listInvoices(propertyId, query.status, limit, offset);

    return {
      data: result.records.map((record) => ({
        id: record.id,
        invoice_code: record.invoice_code,
        invoice_status: record.invoice_status,
        subtotal_amount: Number(record.subtotal_amount),
        late_fee_amount: Number(record.late_fee_amount),
        total_amount: Number(record.total_amount),
        cycle_start_date: record.cycle_start_date,
        cycle_end_date: record.cycle_end_date,
        due_date: record.due_date,
        paid_at: record.paid_at?.toISOString() ?? null,
      })),
      meta: this.meta(limit, offset, result.total),
    };
  }

  async listPayments(user: UserAccessContext, query: ListAdminPaymentsQueryDto) {
    const propertyId = await this.authorizeProperty(user, query.property_id);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const result = await this.billing.listPayments(propertyId, query.status, limit, offset);

    return {
      data: result.records.map((record) => ({
        id: record.id,
        payment_code: record.payment_code,
        payment_status: record.payment_status,
        amount: Number(record.amount),
        paid_at: record.paid_at?.toISOString() ?? null,
        verified_at: record.verified_at?.toISOString() ?? null,
      })),
      meta: this.meta(limit, offset, result.total),
    };
  }

  private async authorizeProperty(user: UserAccessContext, propertyId?: string): Promise<string> {
    if (!propertyId) {
      throw new BadRequestException({
        code: 'PROPERTY_ID_REQUIRED',
        message: 'property_id is required',
      });
    }
    await this.properties.get(user, propertyId);
    return propertyId;
  }

  private meta(limit: number, offset: number, total: number): PageMeta {
    return { limit, offset, total };
  }
}
