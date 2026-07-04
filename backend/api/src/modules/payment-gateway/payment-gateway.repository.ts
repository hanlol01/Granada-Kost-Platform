import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  CreatePaymentTransactionInput,
  PaymentGatewayProviderName,
  PaymentTransactionRecord,
  PaymentTransactionStatus,
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
           metadata = metadata || '{"expired_by":"m15c_c_foundation"}'::jsonb
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

  private columns(): string {
    return `id, invoice_id, property_id, resident_id, requested_by_user_id, provider,
            provider_order_id, provider_transaction_id, amount, currency, status,
            payment_method, payment_url, snap_token_ref, expires_at, paid_at, failed_at,
            raw_status_code, metadata, created_at, updated_at`;
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
