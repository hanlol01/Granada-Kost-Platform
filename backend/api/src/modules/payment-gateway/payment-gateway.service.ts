import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { InvoiceService } from '../billing/services/invoice.service';
import { InvoiceRecord } from '../billing/types/billing.types';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  paymentConfigMissing,
  paymentGatewayDisabled,
  paymentInvoiceAlreadyPaid,
  paymentInvoiceNotFound,
  paymentProviderUnavailable,
  paymentTransactionPending,
} from './payment-gateway.errors';
import { PaymentGatewayConfigService } from './payment-gateway.config';
import { PaymentGatewayRepository } from './payment-gateway.repository';
import {
  PaymentGatewayAuditContext,
  PaymentSessionResponse,
  PaymentStatusResponse,
  PaymentTransactionRecord,
  PaymentTransactionStatus,
} from './payment-gateway.types';
import { MidtransPaymentGatewayProvider } from './providers/midtrans/midtrans.provider';

const PAYMENT_GATEWAY_AUDIT_ACTIONS = {
  sessionCreateRequested: 'payment.session.create.requested',
  sessionCreated: 'payment.session.created',
  sessionReused: 'payment.session.reused',
  sessionCreateFailed: 'payment.session.create.failed',
  transactionPending: 'payment.transaction.pending',
  transactionFailed: 'payment.transaction.failed',
} as const;

export type PaymentTransactionAdminResponse = {
  id: string;
  invoiceId: string;
  propertyId: string;
  residentId: string;
  requestedByUserId: string | null;
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: 'IDR';
  status: PaymentTransactionStatus;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  failedAt: string | null;
};

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly config: PaymentGatewayConfigService,
    private readonly transactions: PaymentGatewayRepository,
    private readonly invoices: InvoiceService,
    private readonly midtransProvider: MidtransPaymentGatewayProvider,
    private readonly audit: AuditRepository,
  ) {}

  async createResidentPaymentSession(
    invoiceId: string,
    user: UserAccessContext,
    context: PaymentGatewayAuditContext = {},
  ): Promise<PaymentSessionResponse> {
    this.ensureEnabled();
    const invoice = await this.getInvoiceForUser(invoiceId, user.id);
    this.assertInvoicePayable(invoice);
    this.ensureProviderConfigured();

    await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionCreateRequested, invoice, context, undefined, {
      provider: this.config.provider,
    });

    await this.transactions.expirePastDueActiveForInvoice(invoice.id);
    const reusable = await this.transactions.findReusableActiveForInvoice(invoice.id);
    if (reusable) {
      await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionReused, invoice, context, reusable);
      return this.toSessionResponse(invoice, reusable, 'Existing active payment session returned.');
    }

    const amount = await this.invoices.outstandingBalance(invoice.id);
    if (amount <= 0) {
      paymentInvoiceAlreadyPaid();
    }

    const providerOrderId = await this.generateProviderOrderId(invoice.id);
    const expiresAt = this.expiresAt();

    try {
      const providerResult = await this.midtransProvider.createPaymentSession({
        invoiceId: invoice.id,
        propertyId: invoice.propertyId,
        residentId: invoice.residentId,
        userId: user.id,
        amount,
        currency: 'IDR',
        providerOrderId,
        expiresAt,
        returnUrl: this.config.returnUrl!,
        cancelUrl: this.config.cancelUrl!,
        correlationId: context.correlationId,
      });

      const transaction = await this.transactions.create({
        invoiceId: invoice.id,
        propertyId: invoice.propertyId,
        residentId: invoice.residentId,
        requestedByUserId: user.id,
        provider: providerResult.provider,
        providerOrderId,
        amount,
        currency: 'IDR',
        status: providerResult.normalizedStatus,
        paymentUrl: providerResult.paymentUrl,
        snapTokenRef: null,
        expiresAt: providerResult.expiresAt,
        metadata: providerResult.safeMetadata,
      });

      await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionCreated, invoice, context, transaction);
      await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionPending, invoice, context, transaction);
      return this.toSessionResponse(invoice, transaction, providerResult.safeMessage);
    } catch (error) {
      if (error instanceof ConflictException) {
        paymentTransactionPending();
      }
      await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionCreateFailed, invoice, context, undefined, {
        provider: this.config.provider,
        errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
      });
      paymentProviderUnavailable();
    }
  }

  async getResidentPaymentStatus(invoiceId: string, user: UserAccessContext): Promise<PaymentStatusResponse> {
    this.ensureEnabled();
    const invoice = await this.getInvoiceForUser(invoiceId, user.id);
    this.ensureProviderConfigured();
    await this.transactions.expirePastDueActiveForInvoice(invoice.id);
    const transaction = await this.transactions.latestForInvoice(invoice.id);
    return this.toStatusResponse(invoice, transaction);
  }

  async listAdminTransactions(
    propertyIds: string[],
    status?: PaymentTransactionStatus,
    limit?: number,
    offset?: number,
  ): Promise<PaymentTransactionAdminResponse[]> {
    this.ensureEnabled();
    this.ensureProviderConfigured();
    return (await this.transactions.listForProperties(propertyIds, status, limit, offset)).map((transaction) =>
      this.toAdminResponse(transaction),
    );
  }

  async getAdminTransaction(id: string): Promise<PaymentTransactionAdminResponse> {
    this.ensureEnabled();
    this.ensureProviderConfigured();
    const transaction = await this.transactions.findById(id);
    if (!transaction) {
      throw new NotFoundException({ code: 'PAYMENT_TRANSACTION_NOT_FOUND', message: 'Payment transaction not found' });
    }
    return this.toAdminResponse(transaction);
  }

  async getTransactionRecord(id: string): Promise<PaymentTransactionRecord> {
    const transaction = await this.transactions.findById(id);
    if (!transaction) {
      throw new NotFoundException({ code: 'PAYMENT_TRANSACTION_NOT_FOUND', message: 'Payment transaction not found' });
    }
    return transaction;
  }

  private ensureEnabled(): void {
    if (!this.config.enabled) {
      paymentGatewayDisabled();
    }
  }

  private ensureProviderConfigured(): void {
    if (this.config.provider !== 'midtrans') {
      paymentConfigMissing();
    }
    if (this.config.missingMidtransConfig().length > 0) {
      paymentConfigMissing();
    }
  }

  private async getInvoiceForUser(invoiceId: string, userId: string): Promise<InvoiceRecord> {
    try {
      return await this.invoices.getForUser(invoiceId, userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        paymentInvoiceNotFound();
      }
      throw error;
    }
  }

  private assertInvoicePayable(invoice: InvoiceRecord): void {
    if (invoice.invoiceStatus === 'paid' || invoice.paidAt) {
      paymentInvoiceAlreadyPaid();
    }
    if (!['issued', 'unpaid', 'partially_paid', 'overdue'].includes(invoice.invoiceStatus)) {
      throw new ConflictException({
        code: 'PAYMENT_PROVIDER_REJECTED',
        message: 'Invoice is not payable through payment gateway.',
      });
    }
  }

  private async generateProviderOrderId(invoiceId: string): Promise<string> {
    const attemptSeq = (await this.transactions.countAttemptsForInvoice(invoiceId)) + 1;
    const invoiceIdShort = invoiceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
    const randomSuffix = randomBytes(3).toString('hex').toUpperCase();
    return `KST-${invoiceIdShort}-${attemptSeq}-${randomSuffix}`.slice(0, 50);
  }

  private expiresAt(): Date {
    return new Date(Date.now() + this.config.sessionExpiryMinutes * 60 * 1000);
  }

  private toSessionResponse(invoice: InvoiceRecord, transaction: PaymentTransactionRecord, safeMessage: string): PaymentSessionResponse {
    return {
      invoiceId: invoice.id,
      invoiceStatus: invoice.invoiceStatus,
      paymentStatus: transaction.status,
      provider: transaction.provider,
      providerOrderId: transaction.providerOrderId,
      paymentUrl: transaction.paymentUrl,
      snapToken: null,
      expiresAt: transaction.expiresAt?.toISOString() ?? null,
      safeMessage,
    };
  }

  private toStatusResponse(invoice: InvoiceRecord, transaction: PaymentTransactionRecord | null): PaymentStatusResponse {
    return {
      invoiceId: invoice.id,
      invoiceStatus: invoice.invoiceStatus,
      paymentStatus: transaction?.status ?? null,
      provider: transaction?.provider ?? this.config.provider,
      providerOrderId: transaction?.providerOrderId ?? null,
      transactionId: transaction?.id ?? null,
      amount: transaction?.amount ?? invoice.totalAmount,
      currency: 'IDR',
      paymentUrl: transaction?.paymentUrl ?? null,
      snapToken: null,
      expiresAt: transaction?.expiresAt?.toISOString() ?? null,
      paidAt: transaction?.paidAt?.toISOString() ?? invoice.paidAt?.toISOString() ?? null,
      failedAt: transaction?.failedAt?.toISOString() ?? null,
      safeMessage: transaction ? 'Payment status returned.' : 'No payment gateway transaction exists for this invoice.',
    };
  }

  private toAdminResponse(transaction: PaymentTransactionRecord): PaymentTransactionAdminResponse {
    return {
      id: transaction.id,
      invoiceId: transaction.invoiceId,
      propertyId: transaction.propertyId,
      residentId: transaction.residentId,
      requestedByUserId: transaction.requestedByUserId,
      provider: transaction.provider,
      providerOrderId: transaction.providerOrderId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      paidAt: transaction.paidAt?.toISOString() ?? null,
      failedAt: transaction.failedAt?.toISOString() ?? null,
    };
  }

  private async writeAudit(
    action: string,
    invoice: InvoiceRecord,
    context: PaymentGatewayAuditContext,
    transaction?: PaymentTransactionRecord,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: invoice.propertyId,
      action,
      resourceType: 'payment_transaction',
      resourceId: transaction?.id,
      afterData: {
        invoiceId: invoice.id,
        provider: transaction?.provider ?? this.config.provider,
        providerOrderId: transaction?.providerOrderId,
        paymentStatus: transaction?.status,
        amount: transaction?.amount,
        currency: transaction?.currency,
        ...extra,
      },
      resultStatus: action === PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionCreateFailed ? 'failed' : 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
