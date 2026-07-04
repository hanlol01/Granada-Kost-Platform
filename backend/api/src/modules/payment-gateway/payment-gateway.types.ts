import { AuditActorContext, InvoiceRecord } from '../billing/types/billing.types';

export type PaymentGatewayProviderName = 'midtrans';
export type PaymentGatewaySelection = 'none' | PaymentGatewayProviderName;
export type PaymentTransactionStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'denied'
  | 'challenge'
  | 'requires_review'
  | 'unknown';

export type PaymentTransactionRecord = {
  id: string;
  invoiceId: string;
  propertyId: string;
  residentId: string;
  requestedByUserId: string | null;
  provider: PaymentGatewayProviderName;
  providerOrderId: string;
  providerTransactionId: string | null;
  amount: number;
  currency: 'IDR';
  status: PaymentTransactionStatus;
  paymentMethod: string | null;
  paymentUrl: string | null;
  snapTokenRef: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  rawStatusCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentTransactionInput = {
  invoiceId: string;
  propertyId: string;
  residentId: string;
  requestedByUserId: string;
  provider: PaymentGatewayProviderName;
  providerOrderId: string;
  amount: number;
  currency: 'IDR';
  status: PaymentTransactionStatus;
  paymentUrl?: string | null;
  snapTokenRef?: string | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export type PaymentSessionResponse = {
  invoiceId: string;
  invoiceStatus: InvoiceRecord['invoiceStatus'];
  paymentStatus: PaymentTransactionStatus | null;
  provider: PaymentGatewaySelection;
  providerOrderId: string | null;
  paymentUrl: string | null;
  snapToken: string | null;
  expiresAt: string | null;
  safeMessage: string;
};

export type PaymentStatusResponse = PaymentSessionResponse & {
  transactionId: string | null;
  amount: number;
  currency: 'IDR';
  paidAt: string | null;
  failedAt: string | null;
};

export type PaymentGatewayAuditContext = AuditActorContext;
