import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { BILLING_AUDIT_ACTIONS } from '../constants/billing.constants';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { PaymentProofRepository } from '../repositories/payment-proof.repository';
import { AuditActorContext, CreatePaymentProofInput, PaymentProofRecord } from '../types/billing.types';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentProofService {
  constructor(
    private readonly paymentProofs: PaymentProofRepository,
    private readonly invoices: InvoiceRepository,
    private readonly payments: PaymentService,
    private readonly audit: AuditRepository,
  ) {}

  listReviewQueue(propertyId: string): Promise<PaymentProofRecord[]> {
    return this.paymentProofs.listReviewQueue(propertyId);
  }

  list(propertyId: string, status?: PaymentProofRecord['proofStatus'], limit?: number, offset?: number) {
    return this.paymentProofs.list(propertyId, status, limit, offset);
  }

  get(proofId: string): Promise<PaymentProofRecord> {
    return this.requireProof(proofId);
  }

  async submitProof(input: CreatePaymentProofInput): Promise<PaymentProofRecord> {
    return this.paymentProofs.create(input);
  }

  async verifyProof(proofId: string, paymentCode: string, context: AuditActorContext = {}): Promise<PaymentProofRecord> {
    const proof = await this.requireProof(proofId);
    const invoice = await this.invoices.findById(proof.invoiceId);
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    const payment = await this.payments.recordPayment(
      {
        propertyId: proof.propertyId,
        residentId: proof.residentId,
        paymentCode,
        paymentMethod: proof.paymentMethod,
        amount: proof.claimedAmount,
        receivedByUserId: context.actorUserId,
        notes: 'Verified from manual payment proof',
      },
      context,
    );
    await this.payments.allocatePayment(payment.id, [{ invoiceId: proof.invoiceId }], context);

    const updated = await this.paymentProofs.verify(proof.id, payment.id, context.actorUserId ?? proof.uploadedByUserId);
    if (!updated) {
      throw new BadRequestException({ code: 'PAYMENT_PROOF_NOT_REVIEWABLE', message: 'Payment proof is not reviewable' });
    }

    await this.writeProofAudit(BILLING_AUDIT_ACTIONS.paymentVerify, updated, context);
    return updated;
  }

  async rejectProof(proofId: string, reason: string, context: AuditActorContext = {}): Promise<PaymentProofRecord> {
    const proof = await this.requireProof(proofId);
    const updated = await this.paymentProofs.reject(proof.id, reason, context.actorUserId ?? proof.uploadedByUserId);
    if (!updated) {
      throw new BadRequestException({ code: 'PAYMENT_PROOF_NOT_REVIEWABLE', message: 'Payment proof is not reviewable' });
    }

    await this.writeProofAudit(BILLING_AUDIT_ACTIONS.paymentReject, updated, context);
    return updated;
  }

  private async requireProof(proofId: string): Promise<PaymentProofRecord> {
    const proof = await this.paymentProofs.findById(proofId);
    if (!proof) {
      throw new NotFoundException({ code: 'PAYMENT_PROOF_NOT_FOUND', message: 'Payment proof not found' });
    }
    return proof;
  }

  private async writeProofAudit(action: string, proof: PaymentProofRecord, context: AuditActorContext): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: proof.propertyId,
      action,
      resourceType: 'payment_proof',
      resourceId: proof.id,
      afterData: {
        id: proof.id,
        invoiceId: proof.invoiceId,
        proofStatus: proof.proofStatus,
        claimedAmount: proof.claimedAmount,
        paymentId: proof.paymentId,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
