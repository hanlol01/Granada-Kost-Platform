import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewaySelection } from './payment-gateway.types';

@Injectable()
export class PaymentGatewayConfigService {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('paymentGateway.enabled') ?? false;
  }

  get provider(): PaymentGatewaySelection {
    return this.config.get<PaymentGatewaySelection>('paymentGateway.provider') ?? 'none';
  }

  get sessionExpiryMinutes(): number {
    const value = this.config.get<number>('paymentGateway.sessionExpiryMinutes');
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1440;
  }

  get returnUrl(): string | undefined {
    return this.trimmed('paymentGateway.returnUrl');
  }

  get cancelUrl(): string | undefined {
    return this.trimmed('paymentGateway.cancelUrl');
  }

  get webhookBaseUrl(): string | undefined {
    return this.trimmed('paymentGateway.webhookBaseUrl');
  }

  get midtransEnv(): 'sandbox' | 'production' {
    return this.config.get<'sandbox' | 'production'>('paymentGateway.midtrans.env') ?? 'sandbox';
  }

  get midtransServerKey(): string | undefined {
    return this.trimmed('paymentGateway.midtrans.serverKey');
  }

  get midtransClientKey(): string | undefined {
    return this.trimmed('paymentGateway.midtrans.clientKey');
  }

  missingMidtransConfig(): string[] {
    const missing: string[] = [];
    if (!this.midtransServerKey) missing.push('MIDTRANS_SERVER_KEY');
    if (!this.midtransClientKey) missing.push('MIDTRANS_CLIENT_KEY');
    if (!this.returnUrl) missing.push('PAYMENT_RETURN_URL');
    if (!this.cancelUrl) missing.push('PAYMENT_CANCEL_URL');
    if (!this.webhookBaseUrl) missing.push('PAYMENT_WEBHOOK_BASE_URL');
    return missing;
  }

  private trimmed(key: string): string | undefined {
    const value = this.config.get<string>(key);
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
