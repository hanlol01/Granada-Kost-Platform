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
import { InvoiceService } from './services/invoice.service';
import { PaymentProofService } from './services/payment-proof.service';
import { PaymentService } from './services/payment.service';
import { AdminBillingController } from './controllers/admin-billing.controller';
import { AdminBillingRepository } from './repositories/admin-billing.repository';
import { AdminBillingService } from './services/admin-billing.service';
import { W06BillingService } from './services/w06-billing.service';
import { ContractSettlementService } from './services/contract-settlement.service';
import { ContractScheduleIssuanceService } from './services/contract-schedule-issuance.service';
import { ContractSettlementLifecycleScheduler } from './services/contract-settlement-lifecycle.scheduler';
import { AdminPaymentVerificationPolicyService } from './services/admin-payment-verification-policy.service';

@Module({
  imports: [FileModule, PropertyModule, RbacModule],
  controllers: [
    AdminBillingController,
    InvoiceController,
    PaymentController,
    PaymentProofController,
    PaymentAccountController,
    MyBillingController,
  ],
  providers: [
    AdminBillingRepository,
    AdminBillingService,
    W06BillingService,
    ContractSettlementService,
    ContractScheduleIssuanceService,
    ContractSettlementLifecycleScheduler,
    AdminPaymentVerificationPolicyService,
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
  exports: [
    BillingService,
    InvoiceService,
    PaymentService,
    PaymentProofService,
    W06BillingService,
    ContractScheduleIssuanceService,
    AdminPaymentVerificationPolicyService,
  ],
})
export class BillingModule {}
