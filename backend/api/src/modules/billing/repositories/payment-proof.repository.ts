import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreatePaymentProofInput, PaymentProofRecord, PaymentProofStatus } from '../types/billing.types';

type PaymentProofRow = {
  id: string;
  property_id: string;
  resident_id: string;
  invoice_id: string;
  payment_account_id: string | null;
  proof_status: PaymentProofStatus;
  claimed_amount: string;
  payment_method: PaymentProofRecord['paymentMethod'];
  notes: string | null;
  uploaded_by_user_id: string;
  uploaded_at: Date;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  reject_reason: string | null;
  payment_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class PaymentProofRepository {
  constructor(private readonly database: DatabaseService) {}

  async listReviewQueue(propertyId: string): Promise<PaymentProofRecord[]> {
    const result = await this.database.client.query<PaymentProofRow>(
      `SELECT ${this.proofColumns()}
       FROM payment_proofs
       WHERE property_id = $1 AND proof_status = 'pending_review'
       ORDER BY uploaded_at ASC`,
      [propertyId],
    );
    return result.rows.map((row) => this.mapProof(row));
  }

  async list(propertyId: string, status?: PaymentProofStatus, limit = 20, offset = 0): Promise<PaymentProofRecord[]> {
    const result = await this.database.client.query<PaymentProofRow>(
      `SELECT ${this.proofColumns()}
       FROM payment_proofs
       WHERE property_id = $1
         AND ($2::text IS NULL OR proof_status = $2)
       ORDER BY uploaded_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.mapProof(row));
  }

  async findById(id: string): Promise<PaymentProofRecord | null> {
    const result = await this.database.client.query<PaymentProofRow>(
      `SELECT ${this.proofColumns()}
       FROM payment_proofs
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapProof(result.rows[0]) : null;
  }

  async create(input: CreatePaymentProofInput): Promise<PaymentProofRecord> {
    const result = await this.database.client.query<PaymentProofRow>(
      `INSERT INTO payment_proofs (
         property_id, resident_id, invoice_id, payment_account_id, proof_status,
         claimed_amount, payment_method, notes, uploaded_by_user_id
       )
       VALUES ($1, $2, $3, $4, 'pending_review', $5, $6, $7, $8)
       RETURNING ${this.proofColumns()}`,
      [
        input.propertyId,
        input.residentId,
        input.invoiceId,
        input.paymentAccountId ?? null,
        input.claimedAmount,
        input.paymentMethod,
        input.notes ?? null,
        input.uploadedByUserId,
      ],
    );
    return this.mapProof(result.rows[0]);
  }

  async verify(id: string, paymentId: string, actorUserId: string): Promise<PaymentProofRecord | null> {
    const result = await this.database.client.query<PaymentProofRow>(
      `UPDATE payment_proofs
       SET proof_status = 'verified',
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           payment_id = $3,
           updated_at = now()
       WHERE id = $1 AND proof_status = 'pending_review'
       RETURNING ${this.proofColumns()}`,
      [id, actorUserId, paymentId],
    );
    return result.rows[0] ? this.mapProof(result.rows[0]) : null;
  }

  async reject(id: string, reason: string, actorUserId: string): Promise<PaymentProofRecord | null> {
    const result = await this.database.client.query<PaymentProofRow>(
      `UPDATE payment_proofs
       SET proof_status = 'rejected',
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           reject_reason = $3,
           updated_at = now()
       WHERE id = $1 AND proof_status = 'pending_review'
       RETURNING ${this.proofColumns()}`,
      [id, actorUserId, reason],
    );
    return result.rows[0] ? this.mapProof(result.rows[0]) : null;
  }

  private proofColumns(): string {
    return `id, property_id, resident_id, invoice_id, payment_account_id, proof_status,
            claimed_amount, payment_method, notes, uploaded_by_user_id, uploaded_at,
            reviewed_by_user_id, reviewed_at, reject_reason, payment_id, created_at, updated_at`;
  }

  private mapProof(row: PaymentProofRow): PaymentProofRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      invoiceId: row.invoice_id,
      paymentAccountId: row.payment_account_id,
      proofStatus: row.proof_status,
      claimedAmount: Number(row.claimed_amount),
      paymentMethod: row.payment_method,
      notes: row.notes,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedAt: row.uploaded_at,
      reviewedByUserId: row.reviewed_by_user_id,
      reviewedAt: row.reviewed_at,
      rejectReason: row.reject_reason,
      paymentId: row.payment_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
