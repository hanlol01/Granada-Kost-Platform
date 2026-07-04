import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export const PAYMENT_GATEWAY_ERROR_CODES = {
  PAYMENT_GATEWAY_DISABLED: 'PAYMENT_GATEWAY_DISABLED',
  PAYMENT_CONFIG_MISSING: 'PAYMENT_CONFIG_MISSING',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  PAYMENT_INVOICE_NOT_FOUND: 'PAYMENT_INVOICE_NOT_FOUND',
  PAYMENT_INVOICE_OUT_OF_SCOPE: 'PAYMENT_INVOICE_OUT_OF_SCOPE',
  PAYMENT_INVOICE_ALREADY_PAID: 'PAYMENT_INVOICE_ALREADY_PAID',
  PAYMENT_TRANSACTION_PENDING: 'PAYMENT_TRANSACTION_PENDING',
  PAYMENT_TRANSACTION_EXPIRED: 'PAYMENT_TRANSACTION_EXPIRED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_CURRENCY_MISMATCH: 'PAYMENT_CURRENCY_MISMATCH',
  PAYMENT_SIGNATURE_INVALID: 'PAYMENT_SIGNATURE_INVALID',
  PAYMENT_WEBHOOK_DUPLICATE: 'PAYMENT_WEBHOOK_DUPLICATE',
  PAYMENT_PROVIDER_REJECTED: 'PAYMENT_PROVIDER_REJECTED',
  PAYMENT_STATUS_REQUIRES_REVIEW: 'PAYMENT_STATUS_REQUIRES_REVIEW',
  PAYMENT_UNKNOWN_PROVIDER_ERROR: 'PAYMENT_UNKNOWN_PROVIDER_ERROR',
} as const;

export type PaymentGatewayErrorCode = keyof typeof PAYMENT_GATEWAY_ERROR_CODES;

const SAFE_MESSAGES: Record<PaymentGatewayErrorCode, string> = {
  PAYMENT_GATEWAY_DISABLED: 'Pembayaran online belum tersedia.',
  PAYMENT_CONFIG_MISSING: 'Pembayaran online sedang tidak tersedia. Coba lagi nanti.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'Layanan pembayaran sedang gangguan. Coba lagi nanti.',
  PAYMENT_INVOICE_NOT_FOUND: 'Tagihan tidak ditemukan.',
  PAYMENT_INVOICE_OUT_OF_SCOPE: 'Anda tidak memiliki akses ke tagihan ini.',
  PAYMENT_INVOICE_ALREADY_PAID: 'Tagihan sudah lunas.',
  PAYMENT_TRANSACTION_PENDING: 'Masih ada pembayaran online yang sedang menunggu.',
  PAYMENT_TRANSACTION_EXPIRED: 'Sesi pembayaran kedaluwarsa.',
  PAYMENT_AMOUNT_MISMATCH: 'Jumlah pembayaran tidak sesuai.',
  PAYMENT_CURRENCY_MISMATCH: 'Mata uang pembayaran tidak sesuai.',
  PAYMENT_SIGNATURE_INVALID: 'Signature pembayaran tidak valid.',
  PAYMENT_WEBHOOK_DUPLICATE: 'Webhook pembayaran sudah diproses.',
  PAYMENT_PROVIDER_REJECTED: 'Pembayaran ditolak oleh penyedia pembayaran.',
  PAYMENT_STATUS_REQUIRES_REVIEW: 'Pembayaran sedang diperiksa.',
  PAYMENT_UNKNOWN_PROVIDER_ERROR: 'Terjadi kendala pada layanan pembayaran.',
};

export function paymentGatewayDisabled(): never {
  throw new ForbiddenException({ code: 'PAYMENT_GATEWAY_DISABLED', message: SAFE_MESSAGES.PAYMENT_GATEWAY_DISABLED });
}

export function paymentConfigMissing(): never {
  throw new InternalServerErrorException({ code: 'PAYMENT_CONFIG_MISSING', message: SAFE_MESSAGES.PAYMENT_CONFIG_MISSING });
}

export function paymentProviderUnavailable(): never {
  throw new BadGatewayException({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: SAFE_MESSAGES.PAYMENT_PROVIDER_UNAVAILABLE });
}

export function paymentInvoiceNotFound(): never {
  throw new NotFoundException({ code: 'PAYMENT_INVOICE_NOT_FOUND', message: SAFE_MESSAGES.PAYMENT_INVOICE_NOT_FOUND });
}

export function paymentInvoiceAlreadyPaid(): never {
  throw new ConflictException({ code: 'PAYMENT_INVOICE_ALREADY_PAID', message: SAFE_MESSAGES.PAYMENT_INVOICE_ALREADY_PAID });
}

export function paymentTransactionPending(): never {
  throw new ConflictException({ code: 'PAYMENT_TRANSACTION_PENDING', message: SAFE_MESSAGES.PAYMENT_TRANSACTION_PENDING });
}

export function paymentTransactionExpired(): never {
  throw new GoneException({ code: 'PAYMENT_TRANSACTION_EXPIRED', message: SAFE_MESSAGES.PAYMENT_TRANSACTION_EXPIRED });
}

export function paymentSignatureInvalid(): never {
  throw new UnauthorizedException({ code: 'PAYMENT_SIGNATURE_INVALID', message: SAFE_MESSAGES.PAYMENT_SIGNATURE_INVALID });
}

export function safePaymentMessage(code: PaymentGatewayErrorCode): string {
  return SAFE_MESSAGES[code];
}
