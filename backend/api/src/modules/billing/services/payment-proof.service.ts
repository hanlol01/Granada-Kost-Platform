import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { FileRepository } from '../../file/file.repository';
import { BILLING_AUDIT_ACTIONS } from '../constants/billing.constants';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { PaymentProofFileRepository } from '../repositories/payment-proof-file.repository';
import { PaymentProofRepository } from '../repositories/payment-proof.repository';
import { AuditActorContext, CreatePaymentProofInput, PaymentProofRecord } from '../types/billing.types';
import { PaymentService } from './payment.service';

const MAX_PAYMENT_PROOF_FILES = 3;

@Injectable()
export class PaymentProofService {
  constructor(
    private readonly paymentProofs: PaymentProofRepository,
    private readonly paymentProofFiles: PaymentProofFileRepository,
    private readonly invoices: InvoiceRepository,
    private readonly payments: PaymentService,
    private readonly files: FileRepository,
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

  async submitProof(input: CreatePaymentProofInput, context: AuditActorContext = {}): Promise<PaymentProofRecord> {
    await this.assertInvoiceBelongsToResidentUser(input);
    const fileIds = this.normalizeFileIds(input.fileIds);
    await this.validatePaymentProofFiles(fileIds, input);

    const proof = await this.paymentProofs.create(input);
    await Promise.all(
      fileIds.map((fileId) =>
        this.paymentProofFiles.attach({
          paymentProofId: proof.id,
          fileId,
          uploadedByUserId: input.uploadedByUserId,
        }),
      ),
    );

    await this.writeProofAudit(BILLING_AUDIT_ACTIONS.paymentProofSubmit, proof, context, { fileIds });
    return proof;
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

  private async assertInvoiceBelongsToResidentUser(input: CreatePaymentProofInput): Promise<void> {
    const invoice = await this.invoices.findByIdForUser(input.invoiceId, input.uploadedByUserId);
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }
    if (invoice.propertyId !== input.propertyId || invoice.residentId !== input.residentId) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_INVOICE_SCOPE_MISMATCH',
        message: 'Payment proof invoice does not match resident or property context',
      });
    }
  }

  private normalizeFileIds(fileIds: string[] | undefined): string[] {
    const unique = Array.from(new Set(fileIds ?? []));
    if (unique.length > MAX_PAYMENT_PROOF_FILES) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_FILE_LIMIT_EXCEEDED',
        message: `Payment proof can attach at most ${MAX_PAYMENT_PROOF_FILES} files`,
      });
    }
    return unique;
  }

  private async validatePaymentProofFiles(fileIds: string[], input: CreatePaymentProofInput): Promise<void> {
    for (const fileId of fileIds) {
      const file = await this.files.findById(fileId);
      if (!file || file.isDeleted) {
        throw new BadRequestException({
          code: 'PAYMENT_PROOF_FILE_NOT_FOUND',
          message: 'Payment proof file was not found or has been deleted',
        });
      }
      if (file.filePurpose !== 'payment_proof') {
        throw new BadRequestException({
          code: 'PAYMENT_PROOF_FILE_PURPOSE_INVALID',
          message: 'Attached file must use payment_proof purpose',
        });
      }
      if (file.propertyId !== input.propertyId) {
        throw new BadRequestException({
          code: 'PAYMENT_PROOF_FILE_PROPERTY_MISMATCH',
          message: 'Attached file must belong to the same property as the invoice',
        });
      }
      if (file.uploaderUserId !== input.uploadedByUserId) {
        throw new BadRequestException({
          code: 'PAYMENT_PROOF_FILE_OWNER_MISMATCH',
          message: 'Resident can only attach files they uploaded',
        });
      }
    }
  }

  private async writeProofAudit(
    action: string,
    proof: PaymentProofRecord,
    context: AuditActorContext,
    extraData: Record<string, unknown> = {},
  ): Promise<void> {
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
        ...extraData,
      },
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
