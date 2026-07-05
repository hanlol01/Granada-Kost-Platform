import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentGatewayAdminController } from './payment-gateway.admin.controller';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayWebhookController } from './payment-gateway.webhook.controller';
import { PaymentGatewayConfigService } from './payment-gateway.config';
import { PaymentGatewayRepository } from './payment-gateway.repository';
import { PaymentGatewayService } from './payment-gateway.service';
import { MidtransConfig } from './providers/midtrans/midtrans.config';
import { MidtransPaymentGatewayProvider } from './providers/midtrans/midtrans.provider';

@Module({
  imports: [BillingModule, PropertyModule, RbacModule],
  controllers: [PaymentGatewayController, PaymentGatewayAdminController, PaymentGatewayWebhookController],
  providers: [
    PaymentGatewayConfigService,
    PaymentGatewayRepository,
    PaymentGatewayService,
    MidtransConfig,
    MidtransPaymentGatewayProvider,
  ],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
