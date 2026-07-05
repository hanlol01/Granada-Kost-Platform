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
  paymentSignatureInvalid,
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
  PaymentWebhookEventRecord,
} from './payment-gateway.types';
import { MidtransPaymentGatewayProvider } from './providers/midtrans/midtrans.provider';
import type { NormalizedWebhookEvent, RawWebhookRequest } from './providers/payment-gateway-provider.interface';

const PAYMENT_GATEWAY_AUDIT_ACTIONS = {
  sessionCreateRequested: 'payment.session.create.requested',
  sessionCreated: 'payment.session.created',
  sessionReused: 'payment.session.reused',
  sessionCreateFailed: 'payment.session.create.failed',
  transactionPending: 'payment.transaction.pending',
  transactionPaid: 'payment.transaction.paid',
  transactionFailed: 'payment.transaction.failed',
  transactionExpired: 'payment.transaction.expired',
  transactionRequiresReview: 'payment.transaction.requires_review',
  webhookReceived: 'payment.webhook.received',
  webhookVerified: 'payment.webhook.verified',
  webhookDuplicate: 'payment.webhook.duplicate',
  webhookRejected: 'payment.webhook.rejected',
  invoiceMarkPaidGateway: 'payment.invoice.mark_paid_gateway',
} as const;

type PaymentWebhookResponseStatus = 'accepted' | 'duplicate' | 'requires_review' | 'processed';

type PaymentWebhookResponse = {
  provider: 'midtrans';
  providerOrderId: string | null;
  status: PaymentWebhookResponseStatus;
  code: string | null;
  safeMessage: string;
};

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
    const amount = await this.invoices.outstandingBalance(invoice.id);
    if (amount <= 0) {
      paymentInvoiceAlreadyPaid();
    }

    const reusable = await this.transactions.findReusableActiveForInvoice(invoice.id);
    if (reusable) {
      if (reusable.amount !== amount) {
        paymentTransactionPending();
      }
      await this.writeAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.sessionReused, invoice, context, reusable);
      return this.toSessionResponse(invoice, reusable, 'Existing active payment session returned.');
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
        snapTokenRef: providerResult.snapToken,
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

  async handleMidtransWebhook(
    rawRequest: RawWebhookRequest,
    context: PaymentGatewayAuditContext = {},
  ): Promise<PaymentWebhookResponse> {
    this.ensureEnabled();
    this.ensureProviderConfigured();

    let event: NormalizedWebhookEvent;
    try {
      event = await this.midtransProvider.parseAndVerifyWebhook(rawRequest);
    } catch {
      paymentProviderUnavailable();
    }

    await this.writeWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookReceived, event, context, undefined, undefined, {
      signatureValid: event.signatureValid,
    });

    if (!event.signatureValid) {
      const persisted = await this.persistWebhookEvent(event, 'rejected', 'PAYMENT_SIGNATURE_INVALID', 'invalid_signature');
      if (persisted.duplicate) {
        await this.markDuplicateWebhook(event, persisted.event, context);
      }
      await this.writeWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookRejected,
        event,
        context,
        persisted.event,
        undefined,
        { code: 'PAYMENT_SIGNATURE_INVALID', reason: 'invalid_signature' },
        'failed',
      );
      paymentSignatureInvalid();
    }

    const persisted = await this.persistWebhookEvent(event, 'verified');
    if (persisted.duplicate) {
      await this.markDuplicateWebhook(event, persisted.event, context);
      return this.webhookResponse(event, 'duplicate', 'PAYMENT_WEBHOOK_DUPLICATE', 'Duplicate webhook acknowledged.');
    }

    await this.writeWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookVerified, event, context, persisted.event);

    const transaction = await this.transactions.findByProviderOrderId(event.provider, event.providerOrderId);
    if (!transaction) {
      await this.transactions.markWebhookEvent(persisted.event.id, {
        status: 'requires_review',
        normalizedResult: this.normalizedWebhookResult(event, 'PAYMENT_STATUS_REQUIRES_REVIEW', 'unknown_order'),
        sanitizedMetadata: { reason: 'unknown_order' },
      });
      await this.writeWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookRejected,
        event,
        context,
        persisted.event,
        undefined,
        { code: 'PAYMENT_STATUS_REQUIRES_REVIEW', reason: 'unknown_order' },
        'failed',
      );
      return this.webhookResponse(event, 'requires_review', 'PAYMENT_STATUS_REQUIRES_REVIEW', 'Webhook stored for review.');
    }

    if (event.amount !== transaction.amount) {
      const updated = await this.transactions.markTransactionRequiresReview(event, 'amount_mismatch');
      await this.transactions.markWebhookEvent(persisted.event.id, {
        status: 'requires_review',
        normalizedResult: this.normalizedWebhookResult(event, 'PAYMENT_AMOUNT_MISMATCH', 'amount_mismatch'),
        sanitizedMetadata: { reason: 'amount_mismatch' },
      });
      await this.writeWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookRejected,
        event,
        context,
        persisted.event,
        updated ?? transaction,
        { code: 'PAYMENT_AMOUNT_MISMATCH', reason: 'amount_mismatch' },
        'failed',
      );
      await this.writeTransactionWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionRequiresReview, updated ?? transaction, context, {
        code: 'PAYMENT_AMOUNT_MISMATCH',
      });
      return this.webhookResponse(event, 'requires_review', 'PAYMENT_AMOUNT_MISMATCH', 'Webhook amount mismatch stored for review.');
    }

    if (event.currency && event.currency !== 'IDR') {
      const updated = await this.transactions.markTransactionRequiresReview(event, 'currency_mismatch');
      await this.transactions.markWebhookEvent(persisted.event.id, {
        status: 'requires_review',
        normalizedResult: this.normalizedWebhookResult(event, 'PAYMENT_CURRENCY_MISMATCH', 'currency_mismatch'),
        sanitizedMetadata: { reason: 'currency_mismatch' },
      });
      await this.writeWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookRejected,
        event,
        context,
        persisted.event,
        updated ?? transaction,
        { code: 'PAYMENT_CURRENCY_MISMATCH', reason: 'currency_mismatch' },
        'failed',
      );
      await this.writeTransactionWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionRequiresReview, updated ?? transaction, context, {
        code: 'PAYMENT_CURRENCY_MISMATCH',
      });
      return this.webhookResponse(event, 'requires_review', 'PAYMENT_CURRENCY_MISMATCH', 'Webhook currency mismatch stored for review.');
    }

    if (event.normalizedStatus === 'paid') {
      const settlement = await this.transactions.settlePaidWebhook(event, persisted.event.id);
      if (settlement.outcome === 'paid' && settlement.transaction) {
        await this.writeTransactionWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionPaid, settlement.transaction, context, {
          paymentId: settlement.paymentId,
        });
        await this.writeInvoiceGatewayPaidAudit(settlement.invoiceId!, settlement.propertyId!, settlement.transaction, context, settlement.paymentId);
        return this.webhookResponse(event, 'processed', null, 'Paid webhook processed.');
      }
      if (settlement.outcome === 'already_paid') {
        return this.webhookResponse(event, 'processed', null, 'Webhook already applied.');
      }

      await this.writeWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookRejected,
        event,
        context,
        persisted.event,
        settlement.transaction ?? transaction,
        { code: 'PAYMENT_STATUS_REQUIRES_REVIEW', reason: settlement.reason },
        'failed',
      );
      await this.writeTransactionWebhookAudit(
        PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionRequiresReview,
        settlement.transaction ?? transaction,
        context,
        { reason: settlement.reason },
      );
      return this.webhookResponse(event, 'requires_review', 'PAYMENT_STATUS_REQUIRES_REVIEW', 'Paid webhook stored for review.');
    }

    const updated = await this.transactions.applyNonPaidWebhookStatus(event);
    const reviewStatus = this.requiresReviewStatus(event.normalizedStatus);
    await this.transactions.markWebhookEvent(persisted.event.id, {
      status: reviewStatus ? 'requires_review' : 'processed',
      normalizedResult: this.normalizedWebhookResult(event, reviewStatus ? 'PAYMENT_STATUS_REQUIRES_REVIEW' : undefined),
      sanitizedMetadata: { reason: reviewStatus ? 'status_requires_review' : 'non_paid_status_processed' },
    });

    await this.writeTransactionWebhookAudit(this.auditActionForStatus(event.normalizedStatus), updated ?? transaction, context, {
      providerStatus: event.normalizedStatus,
    });

    if (reviewStatus) {
      return this.webhookResponse(event, 'requires_review', 'PAYMENT_STATUS_REQUIRES_REVIEW', 'Webhook status stored for review.');
    }
    return this.webhookResponse(event, 'processed', null, 'Webhook status processed.');
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
    if (this.config.midtransEnv !== 'sandbox') {
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

  private async persistWebhookEvent(
    event: NormalizedWebhookEvent,
    status: 'verified' | 'rejected',
    code?: string,
    reason?: string,
  ) {
    return this.transactions.createWebhookEvent({
      provider: event.provider,
      eventId: this.providerEventId(event),
      providerOrderId: event.providerOrderId || null,
      payloadHash: event.payloadHash,
      status,
      normalizedResult: this.normalizedWebhookResult(event, code, reason),
      sanitizedMetadata: {
        ...event.safeMetadata,
        signatureValid: event.signatureValid,
        reason: reason ?? null,
      },
    });
  }

  private async markDuplicateWebhook(
    event: NormalizedWebhookEvent,
    persisted: PaymentWebhookEventRecord,
    context: PaymentGatewayAuditContext,
  ): Promise<void> {
    await this.transactions.markWebhookEvent(persisted.id, {
      status: persisted.status,
      sanitizedMetadata: { duplicateDeliverySeen: true, duplicatePayloadHash: event.payloadHash },
    });
    await this.writeWebhookAudit(PAYMENT_GATEWAY_AUDIT_ACTIONS.webhookDuplicate, event, context, persisted, undefined, {
      code: 'PAYMENT_WEBHOOK_DUPLICATE',
      originalStatus: persisted.status,
    });
  }

  private providerEventId(event: NormalizedWebhookEvent): string {
    return [event.providerOrderId, event.providerTransactionId, event.rawStatusCode, event.normalizedStatus]
      .filter(Boolean)
      .join(':')
      .slice(0, 255);
  }

  private normalizedWebhookResult(event: NormalizedWebhookEvent, code?: string, reason?: string): Record<string, unknown> {
    return {
      provider: event.provider,
      providerOrderId: event.providerOrderId || null,
      providerTransactionId: event.providerTransactionId,
      normalizedStatus: event.normalizedStatus,
      amount: event.amount,
      currency: event.currency,
      paymentMethod: event.paymentMethod,
      fraudStatus: event.fraudStatus,
      rawStatusCode: event.rawStatusCode,
      payloadHash: event.payloadHash,
      code,
      reason,
    };
  }

  private requiresReviewStatus(status: PaymentTransactionStatus): boolean {
    return status === 'challenge' || status === 'requires_review' || status === 'unknown';
  }

  private auditActionForStatus(status: PaymentTransactionStatus): string {
    if (status === 'expired') return PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionExpired;
    if (status === 'pending' || status === 'created') return PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionPending;
    if (this.requiresReviewStatus(status)) return PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionRequiresReview;
    return PAYMENT_GATEWAY_AUDIT_ACTIONS.transactionFailed;
  }

  private webhookResponse(
    event: NormalizedWebhookEvent,
    status: PaymentWebhookResponseStatus,
    code: string | null,
    safeMessage: string,
  ): PaymentWebhookResponse {
    return {
      provider: 'midtrans',
      providerOrderId: event.providerOrderId || null,
      status,
      code,
      safeMessage,
    };
  }

  private toSessionResponse(invoice: InvoiceRecord, transaction: PaymentTransactionRecord, safeMessage: string): PaymentSessionResponse {
    return {
      invoiceId: invoice.id,
      invoiceStatus: invoice.invoiceStatus,
      paymentStatus: transaction.status,
      provider: transaction.provider,
      providerOrderId: transaction.providerOrderId,
      paymentUrl: transaction.paymentUrl,
      snapToken: transaction.snapTokenRef,
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
      snapToken: transaction?.snapTokenRef ?? null,
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

  private async writeWebhookAudit(
    action: string,
    event: NormalizedWebhookEvent,
    context: PaymentGatewayAuditContext,
    webhookEvent?: PaymentWebhookEventRecord,
    transaction?: PaymentTransactionRecord,
    extra: Record<string, unknown> = {},
    resultStatus: 'success' | 'failed' | 'denied' = 'success',
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: transaction?.propertyId,
      action,
      resourceType: 'payment_webhook_event',
      resourceId: webhookEvent?.id,
      afterData: {
        provider: event.provider,
        providerOrderId: event.providerOrderId || null,
        providerTransactionId: event.providerTransactionId,
        normalizedStatus: event.normalizedStatus,
        amount: event.amount,
        currency: event.currency,
        paymentMethod: event.paymentMethod,
        rawStatusCode: event.rawStatusCode,
        payloadHash: event.payloadHash,
        ...extra,
      },
      resultStatus,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }

  private async writeTransactionWebhookAudit(
    action: string,
    transaction: PaymentTransactionRecord,
    context: PaymentGatewayAuditContext,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: transaction.propertyId,
      action,
      resourceType: 'payment_transaction',
      resourceId: transaction.id,
      afterData: {
        invoiceId: transaction.invoiceId,
        provider: transaction.provider,
        providerOrderId: transaction.providerOrderId,
        paymentStatus: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        ...extra,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }

  private async writeInvoiceGatewayPaidAudit(
    invoiceId: string,
    propertyId: string,
    transaction: PaymentTransactionRecord,
    context: PaymentGatewayAuditContext,
    paymentId?: string,
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId,
      action: PAYMENT_GATEWAY_AUDIT_ACTIONS.invoiceMarkPaidGateway,
      resourceType: 'invoice',
      resourceId: invoiceId,
      afterData: {
        invoiceId,
        provider: transaction.provider,
        providerOrderId: transaction.providerOrderId,
        paymentTransactionId: transaction.id,
        paymentId,
        paidAt: transaction.paidAt?.toISOString() ?? null,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
