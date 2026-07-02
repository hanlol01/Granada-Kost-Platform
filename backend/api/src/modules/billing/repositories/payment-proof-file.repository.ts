import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { CreatePaymentProofFileInput, PaymentProofFileRecord } from '../types/billing.types';

type PaymentProofFileRow = {
  id: string;
  payment_proof_id: string;
  file_id: string;
  uploaded_by_user_id: string | null;
  caption: string | null;
  created_at: Date;
};

@Injectable()
export class PaymentProofFileRepository {
  constructor(private readonly database: DatabaseService) {}

  async attach(input: CreatePaymentProofFileInput): Promise<PaymentProofFileRecord> {
    const result = await this.database.client.query<PaymentProofFileRow>(
      `INSERT INTO payment_proof_files (payment_proof_id, file_id, uploaded_by_user_id, caption)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (payment_proof_id, file_id) DO UPDATE
       SET caption = EXCLUDED.caption
       RETURNING id, payment_proof_id, file_id, uploaded_by_user_id, caption, created_at`,
      [input.paymentProofId, input.fileId, input.uploadedByUserId ?? null, input.caption ?? null],
    );
    return this.map(result.rows[0]);
  }

  async list(paymentProofId: string): Promise<PaymentProofFileRecord[]> {
    const result = await this.database.client.query<PaymentProofFileRow>(
      `SELECT id, payment_proof_id, file_id, uploaded_by_user_id, caption, created_at
       FROM payment_proof_files
       WHERE payment_proof_id = $1
       ORDER BY created_at ASC`,
      [paymentProofId],
    );
    return result.rows.map((row) => this.map(row));
  }

  private map(row: PaymentProofFileRow): PaymentProofFileRecord {
    return {
      id: row.id,
      paymentProofId: row.payment_proof_id,
      fileId: row.file_id,
      uploadedByUserId: row.uploaded_by_user_id,
      caption: row.caption,
      createdAt: row.created_at,
    };
  }
}
