import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { NormalizedWebhookEvent } from './providers/payment-gateway-provider.interface';
import {
  CreatePaymentTransactionInput,
  PaymentGatewayProviderName,
  PaymentTransactionRecord,
  PaymentTransactionStatus,
  PaymentWebhookEventRecord,
  PaymentWebhookEventStatus,
} from './payment-gateway.types';

type PaymentTransactionRow = {
  id: string;
  invoice_id: string;
  property_id: string;
  resident_id: string;
  requested_by_user_id: string | null;
  provider: PaymentGatewayProviderName;
  provider_order_id: string;
  provider_transaction_id: string | null;
  amount: string;
  currency: 'IDR';
  status: PaymentTransactionStatus;
  payment_method: string | null;
  payment_url: string | null;
  snap_token_ref: string | null;
  expires_at: Date | null;
  paid_at: Date | null;
  failed_at: Date | null;
  raw_status_code: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PaymentWebhookEventRow = {
  id: string;
  provider: PaymentGatewayProviderName;
  event_id: string | null;
  provider_order_id: string | null;
  payload_hash: string;
  received_at: Date;
  processed_at: Date | null;
  status: PaymentWebhookEventStatus;
  normalized_result: Record<string, unknown> | null;
  sanitized_metadata: Record<string, unknown> | null;
  created_at: Date;
};

type InvoiceSettlementRow = {
  id: string;
  invoice_status: string;
  paid_at: Date | null;
  total_amount: string;
};

export type CreatePaymentWebhookEventInput = {
  provider: PaymentGatewayProviderName;
  eventId?: string | null;
  providerOrderId?: string | null;
  payloadHash: string;
  status: PaymentWebhookEventStatus;
  normalizedResult?: Record<string, unknown> | null;
  sanitizedMetadata?: Record<string, unknown> | null;
};

export type WebhookEventCreateResult = {
  event: PaymentWebhookEventRecord;
  duplicate: boolean;
};

export type PaidWebhookSettlementResult = {
  outcome: 'paid' | 'already_paid' | 'requires_review' | 'unknown_order';
  reason: string;
  transaction: PaymentTransactionRecord | null;
  invoiceId: string | null;
  propertyId: string | null;
  paymentId?: string;
};

@Injectable()
export class PaymentGatewayRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreatePaymentTransactionInput): Promise<PaymentTransactionRecord> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `INSERT INTO payment_transactions (
         invoice_id, property_id, resident_id, requested_by_user_id, provider,
         provider_order_id, amount, currency, status, payment_url, snap_token_ref,
         expires_at, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       RETURNING ${this.columns()}`,
      [
        input.invoiceId,
        input.propertyId,
        input.residentId,
        input.requestedByUserId,
        input.provider,
        input.providerOrderId,
        input.amount,
        input.currency,
        input.status,
        input.paymentUrl ?? null,
        input.snapTokenRef ?? null,
        input.expiresAt ?? null,
        JSON.stringify(this.sanitizeMetadata(input.metadata ?? {})),
      ],
    );
    return this.map(result.rows[0]);
  }

  async countAttemptsForInvoice(invoiceId: string): Promise<number> {
    const result = await this.database.client.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM payment_transactions
       WHERE invoice_id = $1`,
      [invoiceId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findReusableActiveForInvoice(invoiceId: string): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `SELECT ${this.columns()}
       FROM payment_transactions
       WHERE invoice_id = $1
         AND status IN ('created', 'pending')
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC
       LIMIT 1`,
      [invoiceId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async expirePastDueActiveForInvoice(invoiceId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE payment_transactions
       SET status = 'expired',
           failed_at = COALESCE(failed_at, now()),
           updated_at = now(),
           metadata = metadata || '{"expired_by":"payment_session_expiry"}'::jsonb
       WHERE invoice_id = $1
         AND status IN ('created', 'pending')
         AND expires_at IS NOT NULL
         AND expires_at <= now()`,
      [invoiceId],
    );
  }

  async latestForInvoice(invoiceId: string): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `SELECT ${this.columns()}
       FROM payment_transactions
       WHERE invoice_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [invoiceId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async listForProperties(
    propertyIds: string[],
    status?: PaymentTransactionStatus,
    limit = 20,
    offset = 0,
  ): Promise<PaymentTransactionRecord[]> {
    if (propertyIds.length === 0) {
      return [];
    }
    const result = await this.database.client.query<PaymentTransactionRow>(
      `SELECT ${this.columns()}
       FROM payment_transactions
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `SELECT ${this.columns()}
       FROM payment_transactions
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findByProviderOrderId(
    provider: PaymentGatewayProviderName,
    providerOrderId: string,
  ): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `SELECT ${this.columns()}
       FROM payment_transactions
       WHERE provider = $1 AND provider_order_id = $2`,
      [provider, providerOrderId],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async createWebhookEvent(input: CreatePaymentWebhookEventInput): Promise<WebhookEventCreateResult> {
    const result = await this.database.client.query<PaymentWebhookEventRow>(
      `INSERT INTO payment_webhook_events (
         provider, event_id, provider_order_id, payload_hash, status,
         normalized_result, sanitized_metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       ON CONFLICT (provider, payload_hash) DO NOTHING
       RETURNING ${this.webhookColumns()}`,
      [
        input.provider,
        input.eventId ?? null,
        input.providerOrderId ?? null,
        input.payloadHash,
        input.status,
        this.toJson(input.normalizedResult ?? null),
        this.toJson(this.sanitizeMetadata(input.sanitizedMetadata ?? {})),
      ],
    );

    if (result.rows[0]) {
      return { event: this.mapWebhookEvent(result.rows[0]), duplicate: false };
    }

    const existing = await this.findWebhookEventByHash(input.provider, input.payloadHash);
    if (!existing) {
      throw new Error('Payment webhook duplicate lookup failed');
    }
    return { event: existing, duplicate: true };
  }

  async markWebhookEvent(
    id: string,
    input: {
      status: PaymentWebhookEventStatus;
      normalizedResult?: Record<string, unknown> | null;
      sanitizedMetadata?: Record<string, unknown> | null;
      processed?: boolean;
    },
  ): Promise<PaymentWebhookEventRecord | null> {
    const result = await this.database.client.query<PaymentWebhookEventRow>(
      `UPDATE payment_webhook_events
       SET status = $2,
           processed_at = CASE WHEN $3 THEN COALESCE(processed_at, now()) ELSE processed_at END,
           normalized_result = COALESCE($4::jsonb, normalized_result),
           sanitized_metadata = COALESCE(sanitized_metadata, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb)
       WHERE id = $1
       RETURNING ${this.webhookColumns()}`,
      [
        id,
        input.status,
        input.processed ?? true,
        this.toJson(input.normalizedResult ?? null),
        this.toJson(this.sanitizeMetadata(input.sanitizedMetadata ?? {})),
      ],
    );
    return result.rows[0] ? this.mapWebhookEvent(result.rows[0]) : null;
  }

  async markTransactionRequiresReview(
    event: NormalizedWebhookEvent,
    reason: string,
  ): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `UPDATE payment_transactions
       SET status = CASE WHEN status = 'paid' THEN status ELSE 'requires_review' END,
           provider_transaction_id = COALESCE($3, provider_transaction_id),
           payment_method = COALESCE($4, payment_method),
           raw_status_code = COALESCE($5, raw_status_code),
           metadata = metadata || $6::jsonb,
           updated_at = now()
       WHERE provider = $1 AND provider_order_id = $2
       RETURNING ${this.columns()}`,
      [
        event.provider,
        event.providerOrderId,
        event.providerTransactionId,
        event.paymentMethod,
        event.rawStatusCode,
        JSON.stringify(this.webhookTransactionMetadata(event, reason)),
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async applyNonPaidWebhookStatus(event: NormalizedWebhookEvent): Promise<PaymentTransactionRecord | null> {
    const result = await this.database.client.query<PaymentTransactionRow>(
      `UPDATE payment_transactions
       SET status = CASE
             WHEN status IN ('paid', 'requires_review', 'challenge') THEN status
             ELSE $3
           END,
           provider_transaction_id = COALESCE($4, provider_transaction_id),
           payment_method = COALESCE($5, payment_method),
           raw_status_code = COALESCE($6, raw_status_code),
           failed_at = CASE
             WHEN status <> 'paid' AND $3 = ANY($7::text[]) THEN COALESCE(failed_at, now())
             ELSE failed_at
           END,
           metadata = metadata || $8::jsonb,
           updated_at = now()
       WHERE provider = $1 AND provider_order_id = $2
       RETURNING ${this.columns()}`,
      [
        event.provider,
        event.providerOrderId,
        event.normalizedStatus,
        event.providerTransactionId,
        event.paymentMethod,
        event.rawStatusCode,
        ['failed', 'expired', 'cancelled', 'denied'],
        JSON.stringify(this.webhookTransactionMetadata(event, 'non_paid_status')),
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async settlePaidWebhook(event: NormalizedWebhookEvent, webhookEventId: string): Promise<PaidWebhookSettlementResult> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const transactionResult = await client.query<PaymentTransactionRow>(
        `SELECT ${this.columns()}
         FROM payment_transactions
         WHERE provider = $1 AND provider_order_id = $2
         FOR UPDATE`,
        [event.provider, event.providerOrderId],
      );
      const transactionRow = transactionResult.rows[0];
      if (!transactionRow) {
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_STATUS_REQUIRES_REVIEW', 'unknown_order'),
          sanitizedMetadata: { reason: 'unknown_order' },
          processed: true,
        });
        await client.query('COMMIT');
        return { outcome: 'unknown_order', reason: 'unknown_order', transaction: null, invoiceId: null, propertyId: null };
      }

      const transaction = this.map(transactionRow);
      if (transaction.status === 'paid') {
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'processed',
          normalizedResult: this.webhookResult(event, undefined, 'already_paid_transaction'),
          sanitizedMetadata: { idempotent: true, reason: 'already_paid_transaction' },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'already_paid',
          reason: 'already_paid_transaction',
          transaction,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      const invoice = await this.lockInvoice(client, transaction.invoiceId);
      if (!invoice) {
        const updated = await this.markTransactionRequiresReviewWithClient(client, event, 'invoice_not_found');
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_STATUS_REQUIRES_REVIEW', 'invoice_not_found'),
          sanitizedMetadata: { reason: 'invoice_not_found' },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'requires_review',
          reason: 'invoice_not_found',
          transaction: updated,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      if (invoice.invoice_status === 'paid' || invoice.paid_at) {
        const updated = await this.markTransactionRequiresReviewWithClient(client, event, 'invoice_already_paid_conflict');
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_INVOICE_ALREADY_PAID', 'invoice_already_paid_conflict'),
          sanitizedMetadata: { reason: 'invoice_already_paid_conflict' },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'requires_review',
          reason: 'invoice_already_paid_conflict',
          transaction: updated,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      if (invoice.invoice_status === 'void') {
        const updated = await this.markTransactionRequiresReviewWithClient(client, event, 'invoice_void_conflict');
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_STATUS_REQUIRES_REVIEW', 'invoice_void_conflict'),
          sanitizedMetadata: { reason: 'invoice_void_conflict' },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'requires_review',
          reason: 'invoice_void_conflict',
          transaction: updated,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      const paidSibling = await client.query<{ id: string }>(
        `SELECT id
         FROM payment_transactions
         WHERE invoice_id = $1 AND status = 'paid' AND id <> $2
         FOR UPDATE`,
        [transaction.invoiceId, transaction.id],
      );
      if (paidSibling.rows[0]) {
        const updated = await this.markTransactionRequiresReviewWithClient(client, event, 'invoice_paid_transaction_conflict');
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_INVOICE_ALREADY_PAID', 'invoice_paid_transaction_conflict'),
          sanitizedMetadata: { reason: 'invoice_paid_transaction_conflict' },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'requires_review',
          reason: 'invoice_paid_transaction_conflict',
          transaction: updated,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      const outstanding = await this.invoiceOutstandingAmount(client, transaction.invoiceId, Number(invoice.total_amount));
      if (outstanding !== transaction.amount) {
        const updated = await this.markTransactionRequiresReviewWithClient(client, event, 'invoice_outstanding_mismatch');
        await this.markWebhookEventWithClient(client, webhookEventId, {
          status: 'requires_review',
          normalizedResult: this.webhookResult(event, 'PAYMENT_AMOUNT_MISMATCH', 'invoice_outstanding_mismatch'),
          sanitizedMetadata: { reason: 'invoice_outstanding_mismatch', outstandingAmount: outstanding },
          processed: true,
        });
        await client.query('COMMIT');
        return {
          outcome: 'requires_review',
          reason: 'invoice_outstanding_mismatch',
          transaction: updated,
          invoiceId: transaction.invoiceId,
          propertyId: transaction.propertyId,
        };
      }

      const paidAt = this.providerPaidAt(event.transactionTime) ?? new Date();
      const updatedTransactionResult = await client.query<PaymentTransactionRow>(
        `UPDATE payment_transactions
         SET status = 'paid',
             paid_at = COALESCE(paid_at, $2),
             failed_at = NULL,
             provider_transaction_id = COALESCE($3, provider_transaction_id),
             payment_method = COALESCE($4, payment_method),
             raw_status_code = COALESCE($5, raw_status_code),
             metadata = metadata || $6::jsonb,
             updated_at = now()
         WHERE id = $1
         RETURNING ${this.columns()}`,
        [
          transaction.id,
          paidAt,
          event.providerTransactionId,
          event.paymentMethod,
          event.rawStatusCode,
          JSON.stringify(this.webhookTransactionMetadata(event, 'settled_by_midtrans_webhook')),
        ],
      );
      const updatedTransaction = this.map(updatedTransactionResult.rows[0]);

      const paymentCode = this.gatewayPaymentCode(event.providerOrderId);
      const paymentResult = await client.query<{ id: string }>(
        `INSERT INTO payments (
           property_id, resident_id, payment_code, payment_method, payment_status,
           amount, paid_at, verified_at, received_by_user_id, reference_number, notes
         )
         VALUES ($1, $2, $3, $4, 'verified', $5, $6, $6, NULL, $7, $8)
         ON CONFLICT (property_id, payment_code) DO UPDATE
         SET reference_number = COALESCE(payments.reference_number, EXCLUDED.reference_number),
             notes = COALESCE(payments.notes, EXCLUDED.notes),
             updated_at = now()
         RETURNING id`,
        [
          transaction.propertyId,
          transaction.residentId,
          paymentCode,
          this.billingPaymentMethod(event.paymentMethod),
          transaction.amount,
          paidAt,
          event.providerTransactionId ?? event.providerOrderId,
          'Midtrans sandbox webhook settlement',
        ],
      );
      const paymentId = paymentResult.rows[0].id;

      await client.query(
        `INSERT INTO payment_allocations (
           payment_id, target_type, target_id, invoice_id, allocated_amount
         )
         VALUES ($1, 'invoice', $2, $2, $3)
         ON CONFLICT (payment_id, target_type, target_id) DO UPDATE
         SET allocated_amount = EXCLUDED.allocated_amount,
             allocation_status = 'active',
             allocated_at = now()`,
        [paymentId, transaction.invoiceId, transaction.amount],
      );

      await client.query(
        `UPDATE invoices
         SET invoice_status = 'paid',
             paid_at = COALESCE(paid_at, $2),
             updated_at = now()
         WHERE id = $1 AND invoice_status <> 'void'`,
        [transaction.invoiceId, paidAt],
      );

      await this.markWebhookEventWithClient(client, webhookEventId, {
        status: 'processed',
        normalizedResult: {
          ...this.webhookResult(event),
          invoiceId: transaction.invoiceId,
          paymentId,
          transactionStatus: 'paid',
        },
        sanitizedMetadata: { reason: 'settled_by_midtrans_webhook', paymentRecorded: true },
        processed: true,
      });

      await client.query('COMMIT');
      return {
        outcome: 'paid',
        reason: 'settled_by_midtrans_webhook',
        transaction: updatedTransaction,
        invoiceId: transaction.invoiceId,
        propertyId: transaction.propertyId,
        paymentId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findWebhookEventByHash(
    provider: PaymentGatewayProviderName,
    payloadHash: string,
  ): Promise<PaymentWebhookEventRecord | null> {
    const result = await this.database.client.query<PaymentWebhookEventRow>(
      `SELECT ${this.webhookColumns()}
       FROM payment_webhook_events
       WHERE provider = $1 AND payload_hash = $2`,
      [provider, payloadHash],
    );
    return result.rows[0] ? this.mapWebhookEvent(result.rows[0]) : null;
  }

  private async markWebhookEventWithClient(
    client: PoolClient,
    id: string,
    input: {
      status: PaymentWebhookEventStatus;
      normalizedResult?: Record<string, unknown> | null;
      sanitizedMetadata?: Record<string, unknown> | null;
      processed?: boolean;
    },
  ): Promise<void> {
    await client.query(
      `UPDATE payment_webhook_events
       SET status = $2,
           processed_at = CASE WHEN $3 THEN COALESCE(processed_at, now()) ELSE processed_at END,
           normalized_result = COALESCE($4::jsonb, normalized_result),
           sanitized_metadata = COALESCE(sanitized_metadata, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb)
       WHERE id = $1`,
      [
        id,
        input.status,
        input.processed ?? true,
        this.toJson(input.normalizedResult ?? null),
        this.toJson(this.sanitizeMetadata(input.sanitizedMetadata ?? {})),
      ],
    );
  }

  private async markTransactionRequiresReviewWithClient(
    client: PoolClient,
    event: NormalizedWebhookEvent,
    reason: string,
  ): Promise<PaymentTransactionRecord | null> {
    const result = await client.query<PaymentTransactionRow>(
      `UPDATE payment_transactions
       SET status = CASE WHEN status = 'paid' THEN status ELSE 'requires_review' END,
           provider_transaction_id = COALESCE($3, provider_transaction_id),
           payment_method = COALESCE($4, payment_method),
           raw_status_code = COALESCE($5, raw_status_code),
           metadata = metadata || $6::jsonb,
           updated_at = now()
       WHERE provider = $1 AND provider_order_id = $2
       RETURNING ${this.columns()}`,
      [
        event.provider,
        event.providerOrderId,
        event.providerTransactionId,
        event.paymentMethod,
        event.rawStatusCode,
        JSON.stringify(this.webhookTransactionMetadata(event, reason)),
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private async lockInvoice(client: PoolClient, invoiceId: string): Promise<InvoiceSettlementRow | null> {
    const result = await client.query<InvoiceSettlementRow>(
      `SELECT id, invoice_status, paid_at, total_amount
       FROM invoices
       WHERE id = $1
       FOR UPDATE`,
      [invoiceId],
    );
    return result.rows[0] ?? null;
  }

  private async invoiceOutstandingAmount(client: PoolClient, invoiceId: string, totalAmount: number): Promise<number> {
    const result = await client.query<{ allocated_amount: string }>(
      `SELECT COALESCE(sum(allocated_amount), 0) AS allocated_amount
       FROM payment_allocations
       WHERE invoice_id = $1 AND allocation_status = 'active'`,
      [invoiceId],
    );
    return Math.max(totalAmount - Number(result.rows[0]?.allocated_amount ?? 0), 0);
  }

  private webhookResult(event: NormalizedWebhookEvent, code?: string, reason?: string): Record<string, unknown> {
    return {
      provider: event.provider,
      providerOrderId: event.providerOrderId,
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

  private webhookTransactionMetadata(event: NormalizedWebhookEvent, reason: string): Record<string, unknown> {
    return this.sanitizeMetadata({
      providerTransactionId: event.providerTransactionId,
      providerStatus: event.normalizedStatus,
      providerStatusCode: event.rawStatusCode,
      paymentMethod: event.paymentMethod,
      fraudStatus: event.fraudStatus,
      eventHash: event.payloadHash,
      webhookReason: reason,
    });
  }

  private providerPaidAt(transactionTime: string | null): Date | null {
    if (!transactionTime) return null;
    const parsed = new Date(transactionTime.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private gatewayPaymentCode(providerOrderId: string): string {
    return `GW-${providerOrderId}`.slice(0, 80);
  }

  private billingPaymentMethod(paymentMethod: string | null): 'bank_transfer' | 'qris' | 'ewallet' | 'other' {
    if (paymentMethod === 'bank_transfer' || paymentMethod === 'qris' || paymentMethod === 'ewallet') {
      return paymentMethod;
    }
    return 'other';
  }

  private columns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}invoice_id, ${p}property_id, ${p}resident_id, ${p}requested_by_user_id, ${p}provider,
            ${p}provider_order_id, ${p}provider_transaction_id, ${p}amount, ${p}currency, ${p}status,
            ${p}payment_method, ${p}payment_url, ${p}snap_token_ref, ${p}expires_at, ${p}paid_at, ${p}failed_at,
            ${p}raw_status_code, ${p}metadata, ${p}created_at, ${p}updated_at`;
  }

  private webhookColumns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}provider, ${p}event_id, ${p}provider_order_id, ${p}payload_hash, ${p}received_at,
            ${p}processed_at, ${p}status, ${p}normalized_result, ${p}sanitized_metadata, ${p}created_at`;
  }

  private map(row: PaymentTransactionRow): PaymentTransactionRecord {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      requestedByUserId: row.requested_by_user_id,
      provider: row.provider,
      providerOrderId: row.provider_order_id,
      providerTransactionId: row.provider_transaction_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentUrl: row.payment_url,
      snapTokenRef: row.snap_token_ref,
      expiresAt: row.expires_at,
      paidAt: row.paid_at,
      failedAt: row.failed_at,
      rawStatusCode: row.raw_status_code,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapWebhookEvent(row: PaymentWebhookEventRow): PaymentWebhookEventRecord {
    return {
      id: row.id,
      provider: row.provider,
      eventId: row.event_id,
      providerOrderId: row.provider_order_id,
      payloadHash: row.payload_hash,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      status: row.status,
      normalizedResult: row.normalized_result,
      sanitizedMetadata: row.sanitized_metadata,
      createdAt: row.created_at,
    };
  }

  private toJson(value: Record<string, unknown> | null): string | null {
    return value === null ? null : JSON.stringify(value);
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (/(secret|token|signature|server_key|client_key|raw|payload)/i.test(key)) {
        continue;
      }
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        safe[key] = value;
      }
    }
    return safe;
  }
}
