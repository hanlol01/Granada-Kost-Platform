import { PaymentGatewayProviderName, PaymentTransactionStatus } from '../payment-gateway.types';

export type CreatePaymentSessionInput = {
  invoiceId: string;
  propertyId: string;
  residentId: string;
  userId: string;
  amount: number;
  currency: 'IDR';
  providerOrderId: string;
  expiresAt: Date | null;
  returnUrl: string;
  cancelUrl: string;
  correlationId?: string;
};

export type CreatePaymentSessionResult = {
  provider: PaymentGatewayProviderName;
  providerOrderId: string;
  paymentSessionId: string | null;
  paymentUrl: string | null;
  snapToken: string | null;
  expiresAt: Date | null;
  normalizedStatus: PaymentTransactionStatus;
  safeMessage: string;
  safeMetadata: Record<string, unknown>;
};

export type RawWebhookRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  body: unknown;
};

export type NormalizedWebhookEvent = {
  provider: PaymentGatewayProviderName;
  providerOrderId: string;
  providerTransactionId: string | null;
  normalizedStatus: PaymentTransactionStatus;
  amount: number;
  currency: 'IDR';
  paymentMethod: string | null;
  transactionTime: string | null;
  fraudStatus: string | null;
  signatureValid: boolean;
  rawStatusCode: string | null;
  payloadHash: string;
  safeMetadata: Record<string, unknown>;
};

export type ProviderCapabilities = {
  methods: string[];
  supportsExpiry: boolean;
  supportsCancel: boolean;
};

export interface PaymentGatewayProvider {
  readonly providerName: PaymentGatewayProviderName;
  createPaymentSession(input: CreatePaymentSessionInput): Promise<CreatePaymentSessionResult>;
  parseAndVerifyWebhook(rawRequest: RawWebhookRequest): Promise<NormalizedWebhookEvent>;
  normalizeStatus(providerPayload: Record<string, unknown>): PaymentTransactionStatus;
  getPaymentStatus?(providerOrderId: string): Promise<NormalizedWebhookEvent>;
  capabilities(): ProviderCapabilities;
}
