import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { BillingPeriodRepository } from './repositories/billing-period.repository';
import { InvoiceRepository } from './repositories/invoice.repository';
import { PaymentProofRepository } from './repositories/payment-proof.repository';
import { PaymentProofFileRepository } from './repositories/payment-proof-file.repository';
import { PaymentAccountRepository } from './repositories/payment-account.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { BillingService } from './services/billing.service';
import { InvoiceController } from './controllers/invoice.controller';
import { MyBillingController } from './controllers/my-billing.controller';
import { PaymentAccountController } from './controllers/payment-account.controller';
import { PaymentController } from './controllers/payment.controller';
import { PaymentProofController } from './controllers/payment-proof.controller';
import { PropertyOwnerBillingController } from './controllers/property-owner-billing.controller';
import { InvoiceService } from './services/invoice.service';
import { PaymentProofService } from './services/payment-proof.service';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [FileModule, PropertyModule, RbacModule],
  controllers: [
    InvoiceController,
    PaymentController,
    PaymentProofController,
    PaymentAccountController,
    MyBillingController,
    PropertyOwnerBillingController,
  ],
  providers: [
    BillingPeriodRepository,
    InvoiceRepository,
    PaymentRepository,
    PaymentProofRepository,
    PaymentProofFileRepository,
    PaymentAccountRepository,
    BillingService,
    InvoiceService,
    PaymentService,
    PaymentProofService,
  ],
  exports: [BillingService, InvoiceService, PaymentService, PaymentProofService],
})
export class BillingModule {}
