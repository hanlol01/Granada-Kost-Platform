import { Injectable } from '@nestjs/common';
import { BillingPeriodRepository } from '../repositories/billing-period.repository';
import { PaymentAccountRepository } from '../repositories/payment-account.repository';
import { BillingPeriodRecord, InvoiceRecord } from '../types/billing.types';
import { InvoiceService } from './invoice.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly periods: BillingPeriodRepository,
    private readonly invoices: InvoiceService,
    private readonly paymentAccounts: PaymentAccountRepository,
  ) {}

  listPeriods(propertyId: string): Promise<BillingPeriodRecord[]> {
    return this.periods.list(propertyId);
  }

  listInvoices(propertyId: string, status?: InvoiceRecord['invoiceStatus']): Promise<InvoiceRecord[]> {
    return this.invoices.list(propertyId, status);
  }

  async outstandingForInvoice(invoiceId: string): Promise<number> {
    return this.invoices.outstandingBalance(invoiceId);
  }

  paymentAccountsForProperties(propertyIds?: string[]) {
    return this.paymentAccounts.list(propertyIds);
  }

  billingSummaryForProperties(propertyIds: string[]) {
    return this.invoices.summaryForProperties(propertyIds);
  }
}
