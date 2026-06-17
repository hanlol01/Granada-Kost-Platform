import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { PaymentAllocationRecord, PaymentRecord, PaymentStatus, RecordPaymentInput } from '../types/billing.types';

type PaymentRow = {
  id: string;
  property_id: string;
  resident_id: string | null;
  payment_code: string;
  payment_method: PaymentRecord['paymentMethod'];
  payment_status: PaymentStatus;
  amount: string;
  paid_at: Date | null;
  verified_at: Date | null;
  voided_at: Date | null;
  reference_number: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

type AllocationRow = {
  id: string;
  payment_id: string;
  target_type: 'invoice' | 'deposit' | 'other';
  target_id: string;
  invoice_id: string | null;
  allocated_amount: string;
  allocation_status: PaymentAllocationRecord['allocationStatus'];
  allocated_at: Date;
};

@Injectable()
export class PaymentRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: PaymentStatus, limit = 20, offset = 0): Promise<PaymentRecord[]> {
    const result = await this.database.client.query<PaymentRow>(
      `SELECT ${this.paymentColumns()}
       FROM payments
       WHERE property_id = $1
         AND ($2::text IS NULL OR payment_status = $2)
       ORDER BY paid_at DESC NULLS LAST, created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.mapPayment(row));
  }

  async listForUser(userId: string, limit = 20, offset = 0): Promise<PaymentRecord[]> {
    const result = await this.database.client.query<PaymentRow>(
      `SELECT ${this.paymentColumns('payments')}
       FROM payments
       JOIN residents ON residents.id = payments.resident_id
       WHERE residents.user_id = $1
       ORDER BY payments.paid_at DESC NULLS LAST, payments.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map((row) => this.mapPayment(row));
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const result = await this.database.client.query<PaymentRow>(
      `SELECT ${this.paymentColumns()}
       FROM payments
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async record(input: RecordPaymentInput): Promise<PaymentRecord> {
    const result = await this.database.client.query<PaymentRow>(
      `INSERT INTO payments (
         property_id, resident_id, payment_code, payment_method, payment_status,
         amount, paid_at, received_by_user_id, reference_number, notes
       )
       VALUES ($1, $2, $3, $4, 'verified', $5, COALESCE($6, now()), $7, $8, $9)
       RETURNING ${this.paymentColumns()}`,
      [
        input.propertyId,
        input.residentId ?? null,
        input.paymentCode,
        input.paymentMethod,
        input.amount,
        input.paidAt ?? null,
        input.receivedByUserId ?? null,
        input.referenceNumber ?? null,
        input.notes ?? null,
      ],
    );
    return this.mapPayment(result.rows[0]);
  }

  async verify(id: string, actorUserId?: string): Promise<PaymentRecord | null> {
    const result = await this.database.client.query<PaymentRow>(
      `UPDATE payments
       SET payment_status = 'verified',
           verified_by_user_id = $2,
           verified_at = now(),
           updated_at = now()
       WHERE id = $1 AND payment_status = 'pending'
       RETURNING ${this.paymentColumns()}`,
      [id, actorUserId ?? null],
    );
    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async reject(id: string, actorUserId?: string): Promise<PaymentRecord | null> {
    const result = await this.database.client.query<PaymentRow>(
      `UPDATE payments
       SET payment_status = 'void',
           voided_by_user_id = $2,
           voided_at = now(),
           updated_at = now()
       WHERE id = $1 AND payment_status = 'pending'
       RETURNING ${this.paymentColumns()}`,
      [id, actorUserId ?? null],
    );
    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async allocateToInvoice(paymentId: string, invoiceId: string, amount: number): Promise<PaymentAllocationRecord> {
    const result = await this.database.client.query<AllocationRow>(
      `INSERT INTO payment_allocations (
         payment_id, target_type, target_id, invoice_id, allocated_amount
       )
       VALUES ($1, 'invoice', $2, $2, $3)
       ON CONFLICT (payment_id, target_type, target_id) DO UPDATE
       SET allocated_amount = EXCLUDED.allocated_amount,
           allocation_status = 'active',
           allocated_at = now()
       RETURNING id, payment_id, target_type, target_id, invoice_id, allocated_amount,
                 allocation_status, allocated_at`,
      [paymentId, invoiceId, amount],
    );
    return this.mapAllocation(result.rows[0]);
  }

  async listAllocations(paymentId: string): Promise<PaymentAllocationRecord[]> {
    const result = await this.database.client.query<AllocationRow>(
      `SELECT id, payment_id, target_type, target_id, invoice_id, allocated_amount,
              allocation_status, allocated_at
       FROM payment_allocations
       WHERE payment_id = $1
       ORDER BY allocated_at`,
      [paymentId],
    );
    return result.rows.map((row) => this.mapAllocation(row));
  }

  private paymentColumns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}property_id, ${p}resident_id, ${p}payment_code, ${p}payment_method, ${p}payment_status,
            ${p}amount, ${p}paid_at, ${p}verified_at, ${p}voided_at, ${p}reference_number, ${p}notes, ${p}created_at, ${p}updated_at`;
  }

  private mapPayment(row: PaymentRow): PaymentRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      paymentCode: row.payment_code,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      amount: Number(row.amount),
      paidAt: row.paid_at,
      verifiedAt: row.verified_at,
      voidedAt: row.voided_at,
      referenceNumber: row.reference_number,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAllocation(row: AllocationRow): PaymentAllocationRecord {
    return {
      id: row.id,
      paymentId: row.payment_id,
      targetType: row.target_type,
      targetId: row.target_id,
      invoiceId: row.invoice_id,
      allocatedAmount: Number(row.allocated_amount),
      allocationStatus: row.allocation_status,
      allocatedAt: row.allocated_at,
    };
  }
}
