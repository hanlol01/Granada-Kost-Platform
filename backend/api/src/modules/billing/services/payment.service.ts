import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { BILLING_AUDIT_ACTIONS } from '../constants/billing.constants';
import { calculatePaymentAllocationPlan } from '../helpers/payment-allocation.helper';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { AuditActorContext, PaymentAllocationRecord, PaymentRecord, RecordPaymentInput } from '../types/billing.types';
import { InvoiceService } from './invoice.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, status?: PaymentRecord['paymentStatus'], limit?: number, offset?: number): Promise<PaymentRecord[]> {
    return this.payments.list(propertyId, status, limit, offset);
  }

  listForUser(userId: string, limit?: number, offset?: number): Promise<PaymentRecord[]> {
    return this.payments.listForUser(userId, limit, offset);
  }

  async get(paymentId: string): Promise<PaymentRecord> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    }
    return payment;
  }

  async recordPayment(input: RecordPaymentInput, context: AuditActorContext = {}): Promise<PaymentRecord> {
    const payment = await this.payments.record(input);
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: payment.propertyId,
      action: BILLING_AUDIT_ACTIONS.paymentRecord,
      resourceType: 'payment',
      resourceId: payment.id,
      afterData: {
        id: payment.id,
        paymentCode: payment.paymentCode,
        paymentMethod: payment.paymentMethod,
        paymentStatus: payment.paymentStatus,
        amount: payment.amount,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
    return payment;
  }

  async verifyPayment(paymentId: string, context: AuditActorContext = {}): Promise<PaymentRecord> {
    const payment = await this.payments.verify(paymentId, context.actorUserId);
    if (!payment) {
      throw new BadRequestException({ code: 'PAYMENT_NOT_VERIFIABLE', message: 'Payment is not pending' });
    }
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: payment.propertyId,
      action: BILLING_AUDIT_ACTIONS.paymentVerify,
      resourceType: 'payment',
      resourceId: payment.id,
      afterData: { id: payment.id, paymentStatus: payment.paymentStatus },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
    return payment;
  }

  async rejectPayment(paymentId: string, context: AuditActorContext = {}): Promise<PaymentRecord> {
    const payment = await this.payments.reject(paymentId, context.actorUserId);
    if (!payment) {
      throw new BadRequestException({ code: 'PAYMENT_NOT_REJECTABLE', message: 'Payment is not pending' });
    }
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: payment.propertyId,
      action: BILLING_AUDIT_ACTIONS.paymentReject,
      resourceType: 'payment',
      resourceId: payment.id,
      afterData: { id: payment.id, paymentStatus: payment.paymentStatus },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
    return payment;
  }

  async allocatePayment(
    paymentId: string,
    invoiceInputs: Array<{ invoiceId: string; outstandingAmount?: number }>,
    context: AuditActorContext = {},
  ): Promise<PaymentAllocationRecord[]> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    }
    if (payment.paymentStatus !== 'verified') {
      throw new BadRequestException({ code: 'PAYMENT_NOT_VERIFIED', message: 'Only verified payments can be allocated' });
    }

    const invoices = await Promise.all(
      invoiceInputs.map(async (input) => ({
        invoiceId: input.invoiceId,
        outstandingAmount: input.outstandingAmount ?? (await this.invoiceService.outstandingBalance(input.invoiceId)),
      })),
    );
    const plan = calculatePaymentAllocationPlan({ paymentAmount: payment.amount, invoices });
    const allocations: PaymentAllocationRecord[] = [];

    for (const item of plan) {
      allocations.push(await this.payments.allocateToInvoice(payment.id, item.invoiceId, item.allocatedAmount));
      await this.invoiceService.refreshPaymentStatus(item.invoiceId);
    }

    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: payment.propertyId,
      action: BILLING_AUDIT_ACTIONS.paymentAllocate,
      resourceType: 'payment',
      resourceId: payment.id,
      afterData: {
        paymentId: payment.id,
        allocations: allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          allocatedAmount: allocation.allocatedAmount,
        })),
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return allocations;
  }

  async invoiceAllocations(invoiceId: string): Promise<PaymentAllocationRecord[]> {
    return this.invoices.listAllocations(invoiceId);
  }
}
