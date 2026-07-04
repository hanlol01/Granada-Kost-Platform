import { createHash } from 'node:crypto';
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

@Injectable()
export class MidtransPaymentGatewayProvider implements PaymentGatewayProvider {
  readonly providerName = 'midtrans' as const;

  createPaymentSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult> {
    return Promise.resolve({
      provider: this.providerName,
      providerOrderId: input.providerOrderId,
      paymentSessionId: null,
      paymentUrl: null,
      snapToken: null,
      expiresAt: input.expiresAt,
      normalizedStatus: 'pending',
      safeMessage: 'Payment gateway session recorded. Midtrans live session creation is not implemented in M15C-C.',
      safeMetadata: {
        implementation: 'm15c-c-provider-skeleton',
        providerIo: false,
        amount: input.amount,
        currency: input.currency,
      },
    });
  }

  parseAndVerifyWebhook(rawRequest: RawWebhookRequest): Promise<NormalizedWebhookEvent> {
    return Promise.resolve({
      provider: this.providerName,
      providerOrderId: '',
      providerTransactionId: null,
      normalizedStatus: 'requires_review',
      amount: 0,
      currency: 'IDR',
      paymentMethod: null,
      transactionTime: null,
      fraudStatus: null,
      signatureValid: false,
      rawStatusCode: null,
      payloadHash: createHash('sha256').update(rawRequest.rawBody).digest('hex'),
      safeMetadata: {
        implementation: 'm15c-c-webhook-not-implemented',
        providerPayloadStored: false,
      },
    });
  }

  normalizeStatus(providerPayload: Record<string, unknown>): PaymentTransactionStatus {
    const status = typeof providerPayload.transaction_status === 'string' ? providerPayload.transaction_status : '';
    const fraudStatus = typeof providerPayload.fraud_status === 'string' ? providerPayload.fraud_status : '';
    if (status === 'settlement' || (status === 'capture' && fraudStatus === 'accept')) return 'paid';
    if (status === 'capture' && fraudStatus === 'challenge') return 'requires_review';
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
}
