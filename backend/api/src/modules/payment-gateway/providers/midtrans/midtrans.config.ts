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
}
