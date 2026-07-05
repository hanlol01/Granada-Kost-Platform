import { Injectable } from '@nestjs/common';
import { PaymentGatewayConfigService } from '../../payment-gateway.config';

@Injectable()
export class MidtransConfig {
  constructor(private readonly paymentGatewayConfig: PaymentGatewayConfigService) {}

  missingConfig(): string[] {
    return this.paymentGatewayConfig.missingMidtransConfig();
  }

  environment(): 'sandbox' | 'production' {
    return this.paymentGatewayConfig.midtransEnv;
  }

  serverKey(): string | undefined {
    return this.paymentGatewayConfig.midtransServerKey;
  }

  snapEndpoint(): string {
    return this.environment() === 'sandbox'
      ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
      : 'https://app.midtrans.com/snap/v1/transactions';
  }
}
