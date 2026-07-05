import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CreatePaymentSessionInput,
  CreatePaymentSessionResult,
  NormalizedWebhookEvent,
  PaymentGatewayProvider,
  ProviderCapabilities,
  RawWebhookRequest,
} from '../payment-gateway-provider.interface';
import { PaymentTransactionStatus } from '../../payment-gateway.types';
import { MidtransConfig } from './midtrans.config';

type MidtransSnapResponse = {
  token?: unknown;
  redirect_url?: unknown;
};

const MIDTRANS_HTTP_TIMEOUT_MS = 15000;

@Injectable()
export class MidtransPaymentGatewayProvider implements PaymentGatewayProvider {
  readonly providerName = 'midtrans' as const;

  constructor(private readonly config: MidtransConfig) {}

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult> {
    const serverKey = this.config.serverKey();
    if (!serverKey || this.config.environment() !== 'sandbox') {
      throw new Error('Midtrans sandbox configuration is not available');
    }
    this.validateSnapInput(input);

    const payload = this.buildSnapPayload(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MIDTRANS_HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(this.config.snapEndpoint(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Midtrans Snap request failed with HTTP ${response.status}`);
      }

      const body = (await response.json()) as MidtransSnapResponse;
      const snapToken = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : null;
      const paymentUrl = typeof body.redirect_url === 'string' && body.redirect_url.trim() ? body.redirect_url.trim() : null;

      if (!snapToken && !paymentUrl) {
        throw new Error('Midtrans Snap response did not include a safe payment session handle');
      }

      return {
        provider: this.providerName,
        providerOrderId: input.providerOrderId,
        paymentSessionId: snapToken,
        paymentUrl,
        snapToken,
        expiresAt: input.expiresAt,
        normalizedStatus: 'pending',
        safeMessage: 'Midtrans Sandbox payment session created.',
        safeMetadata: {
          providerIo: true,
          midtransEnv: this.config.environment(),
          snapTokenReturned: Boolean(snapToken),
          paymentUrlReturned: Boolean(paymentUrl),
          amount: input.amount,
          currency: input.currency,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  parseAndVerifyWebhook(rawRequest: RawWebhookRequest): Promise<NormalizedWebhookEvent> {
    const payload = this.asRecord(rawRequest.body);
    const rawBody = rawRequest.rawBody.length > 0 ? rawRequest.rawBody : Buffer.from(this.stableJson(payload));
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const orderId = this.readString(payload, 'order_id') ?? '';
    const statusCode = this.readString(payload, 'status_code') ?? '';
    const grossAmount = this.readString(payload, 'gross_amount') ?? '';
    const signature = this.readString(payload, 'signature_key') ?? '';
    const transactionStatus = this.readString(payload, 'transaction_status') ?? '';
    const fraudStatus = this.readString(payload, 'fraud_status');
    const paymentType = this.normalizePaymentMethod(this.readString(payload, 'payment_type'));
    const transactionTime = this.readString(payload, 'transaction_time');
    const transactionId = this.readString(payload, 'transaction_id');
    const currency = this.readString(payload, 'currency');
    const serverKey = this.config.serverKey() ?? '';
    const signatureValid = this.verifySignature({ orderId, statusCode, grossAmount, signature, serverKey });

    return Promise.resolve({
      provider: this.providerName,
      providerOrderId: orderId,
      providerTransactionId: transactionId,
      normalizedStatus: this.normalizeStatus(payload),
      amount: this.parseGrossAmount(grossAmount),
      currency: currency?.toUpperCase() ?? null,
      paymentMethod: paymentType,
      transactionTime,
      fraudStatus,
      signatureValid,
      rawStatusCode: statusCode || null,
      payloadHash,
      safeMetadata: {
        providerPayloadStored: false,
        transactionStatus: transactionStatus || null,
        statusCode: statusCode || null,
        fraudStatus: fraudStatus ?? null,
        paymentType: paymentType ?? null,
        currencyProvided: currency ? true : false,
      },
    });
  }

  normalizeStatus(providerPayload: Record<string, unknown>): PaymentTransactionStatus {
    const status =
      typeof providerPayload.transaction_status === 'string' ? providerPayload.transaction_status.trim().toLowerCase() : '';
    const fraudStatus = typeof providerPayload.fraud_status === 'string' ? providerPayload.fraud_status.trim().toLowerCase() : '';
    if (status === 'settlement' || (status === 'capture' && fraudStatus === 'accept')) return 'paid';
    if (status === 'capture' && fraudStatus === 'challenge') return 'challenge';
    if (status === 'pending') return 'pending';
    if (status === 'deny') return 'denied';
    if (status === 'cancel') return 'cancelled';
    if (status === 'expire') return 'expired';
    if (status === 'failure') return 'failed';
    if (status === 'refund' || status === 'partial_refund' || status === 'chargeback' || status === 'partial_chargeback') {
      return 'requires_review';
    }
    return 'requires_review';
  }

  capabilities(): ProviderCapabilities {
    return {
      methods: ['snap'],
      supportsExpiry: true,
      supportsCancel: false,
    };
  }

  private buildSnapPayload(input: CreatePaymentSessionInput): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      transaction_details: {
        order_id: input.providerOrderId,
        gross_amount: input.amount,
      },
      item_details: [
        {
          id: 'kostation-invoice',
          price: input.amount,
          quantity: 1,
          name: 'Tagihan Kostation',
        },
      ],
      callbacks: {
        finish: input.returnUrl,
      },
      custom_field1: 'kostation_gateway',
      custom_field2: input.correlationId?.slice(0, 255),
    };

    if (input.expiresAt) {
      const duration = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60000));
      payload.expiry = {
        start_time: this.formatMidtransJakartaTime(new Date()),
        unit: 'minutes',
        duration,
      };
      payload.page_expiry = {
        unit: 'minutes',
        duration,
      };
    }

    return payload;
  }

  private validateSnapInput(input: CreatePaymentSessionInput): void {
    if (!input.providerOrderId || input.providerOrderId.length > 50) {
      throw new Error('Midtrans Snap order id is invalid');
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error('Midtrans Snap amount is invalid');
    }
    if (input.currency !== 'IDR') {
      throw new Error('Midtrans Snap currency is invalid');
    }
    if (!input.returnUrl || !input.cancelUrl) {
      throw new Error('Midtrans Snap callback URL is invalid');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new Error('Midtrans Snap expiry is invalid');
    }
  }

  private formatMidtransJakartaTime(date: Date): string {
    const jakartaDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${jakartaDate.getUTCFullYear()}-${pad(jakartaDate.getUTCMonth() + 1)}-${pad(jakartaDate.getUTCDate())} ${pad(
      jakartaDate.getUTCHours(),
    )}:${pad(jakartaDate.getUTCMinutes())}:${pad(jakartaDate.getUTCSeconds())} +0700`;
  }

  private verifySignature(input: {
    orderId: string;
    statusCode: string;
    grossAmount: string;
    signature: string;
    serverKey: string;
  }): boolean {
    if (!input.orderId || !input.statusCode || !input.grossAmount || !input.signature || !input.serverKey) {
      return false;
    }
    const expected = createHash('sha512')
      .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
      .digest('hex');
    return this.safeEqualHex(expected, input.signature);
  }

  private safeEqualHex(expected: string, actual: string): boolean {
    const normalizedActual = actual.toLowerCase();
    if (!/^[a-f0-9]+$/i.test(normalizedActual) || expected.length !== normalizedActual.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(normalizedActual, 'hex'));
  }

  private parseGrossAmount(value: string): number {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  private normalizePaymentMethod(value: string | null): string | null {
    if (!value) return null;
    if (value === 'credit_card') return 'card';
    if (value === 'gopay' || value === 'shopeepay') return 'ewallet';
    if (value === 'echannel' || value === 'permata' || value === 'bca_klikpay' || value === 'cimb_clicks') return 'bank_transfer';
    return value;
  }

  private readString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private stableJson(value: Record<string, unknown>): string {
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = value[key];
          return acc;
        }, {}),
    );
  }
}
