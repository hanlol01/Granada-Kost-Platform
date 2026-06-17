import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { BILLING_AUDIT_ACTIONS } from '../constants/billing.constants';
import { calculateLateFee } from '../helpers/late-fee-calculation.helper';
import { calculateOutstandingBalance } from '../helpers/outstanding-balance.helper';
import { BillingPeriodRepository } from '../repositories/billing-period.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { AuditActorContext, CreateInvoiceInput, InvoiceRecord } from '../types/billing.types';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly billingPeriods: BillingPeriodRepository,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, status?: InvoiceRecord['invoiceStatus'], limit?: number, offset?: number): Promise<InvoiceRecord[]> {
    return this.invoices.list(propertyId, status, limit, offset);
  }

  listForProperties(
    propertyIds: string[],
    status?: InvoiceRecord['invoiceStatus'],
    limit?: number,
    offset?: number,
  ): Promise<InvoiceRecord[]> {
    return this.invoices.listForProperties(propertyIds, status, limit, offset);
  }

  listForUser(userId: string, limit?: number, offset?: number): Promise<InvoiceRecord[]> {
    return this.invoices.listForUser(userId, limit, offset);
  }

  async get(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    return invoice;
  }

  async getForUser(invoiceId: string, userId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoices.findByIdForUser(invoiceId, userId);
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    return invoice;
  }

  async createInvoice(input: CreateInvoiceInput, context: AuditActorContext = {}): Promise<InvoiceRecord> {
    const period = await this.billingPeriods.findById(input.billingPeriodId);
    if (!period) {
      throw new BadRequestException({ code: 'BILLING_PERIOD_NOT_FOUND', message: 'Billing period not found' });
    }
    if (period.propertyId !== input.propertyId) {
      throw new BadRequestException({ code: 'BILLING_PERIOD_SCOPE_MISMATCH', message: 'Billing period property mismatch' });
    }

    const invoice = await this.invoices.create(input);
    await this.writeInvoiceAudit(BILLING_AUDIT_ACTIONS.invoiceCreate, invoice, context);
    return invoice;
  }

  async issueInvoice(invoiceId: string, context: AuditActorContext = {}): Promise<InvoiceRecord> {
    const invoice = await this.invoices.issue(invoiceId);
    if (!invoice) {
      throw new BadRequestException({ code: 'INVOICE_NOT_ISSUABLE', message: 'Invoice is not in draft status' });
    }
    await this.writeInvoiceAudit(BILLING_AUDIT_ACTIONS.invoiceIssue, invoice, context);
    return invoice;
  }

  async cancelInvoice(invoiceId: string, reason: string, context: AuditActorContext = {}): Promise<InvoiceRecord> {
    const invoice = await this.invoices.cancel(invoiceId, reason, context.actorUserId);
    if (!invoice) {
      throw new BadRequestException({ code: 'INVOICE_NOT_CANCELABLE', message: 'Invoice cannot be cancelled' });
    }
    await this.writeInvoiceAudit(BILLING_AUDIT_ACTIONS.invoiceCancel, invoice, context);
    return invoice;
  }

  async outstandingBalance(invoiceId: string): Promise<number> {
    const invoice = await this.get(invoiceId);
    const allocations = await this.invoices.listAllocations(invoiceId);
    return calculateOutstandingBalance(invoice, allocations);
  }

  calculateLateFee(invoice: Pick<InvoiceRecord, 'subtotalAmount' | 'dueDate'>, assessmentDate: string | Date) {
    return calculateLateFee({
      subtotalAmount: invoice.subtotalAmount,
      dueDate: invoice.dueDate,
      assessmentDate,
    });
  }

  async refreshPaymentStatus(invoiceId: string): Promise<InvoiceRecord> {
    const outstanding = await this.outstandingBalance(invoiceId);
    const invoice = await this.invoices.updatePaymentStatus(invoiceId, outstanding);
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    return invoice;
  }

  summaryForProperties(propertyIds: string[]) {
    return this.invoices.summaryForProperties(propertyIds);
  }

  private async writeInvoiceAudit(action: string, invoice: InvoiceRecord, context: AuditActorContext): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: invoice.propertyId,
      action,
      resourceType: 'invoice',
      resourceId: invoice.id,
      afterData: {
        id: invoice.id,
        invoiceCode: invoice.invoiceCode,
        invoiceStatus: invoice.invoiceStatus,
        subtotalAmount: invoice.subtotalAmount,
        lateFeeAmount: invoice.lateFeeAmount,
        totalAmount: invoice.totalAmount,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
