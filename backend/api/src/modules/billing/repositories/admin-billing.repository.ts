import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { InvoiceStatus, PaymentStatus } from '../types/billing.types';

export type AdminInvoiceRow = {
  id: string;
  invoice_code: string;
  invoice_status: InvoiceStatus;
  subtotal_amount: string;
  late_fee_amount: string;
  total_amount: string;
  cycle_start_date: string;
  cycle_end_date: string;
  due_date: string;
  paid_at: Date | null;
};

export type AdminPaymentRow = {
  id: string;
  payment_code: string;
  payment_status: PaymentStatus;
  amount: string;
  paid_at: Date | null;
  verified_at: Date | null;
};

type CountRow = { total: string };

@Injectable()
export class AdminBillingRepository {
  constructor(private readonly database: DatabaseService) {}

  async listInvoices(
    propertyId: string,
    status: InvoiceStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<{ records: AdminInvoiceRow[]; total: number }> {
    const values = [propertyId, status ?? null];
    const [countResult, pageResult] = await Promise.all([
      this.database.client.query<CountRow>(
        `SELECT count(*) AS total
         FROM invoices
         WHERE property_id = $1
           AND ($2::text IS NULL OR invoice_status = $2)`,
        values,
      ),
      this.database.client.query<AdminInvoiceRow>(
        `SELECT id, invoice_code, invoice_status, subtotal_amount, late_fee_amount,
                total_amount, snapshot_period_start_date::text AS cycle_start_date,
                snapshot_period_end_date::text AS cycle_end_date, due_date::text, paid_at
         FROM invoices
         WHERE property_id = $1
           AND ($2::text IS NULL OR invoice_status = $2)
         ORDER BY due_date DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);

    return { records: pageResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
  }

  async listPayments(
    propertyId: string,
    status: PaymentStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<{ records: AdminPaymentRow[]; total: number }> {
    const values = [propertyId, status ?? null];
    const [countResult, pageResult] = await Promise.all([
      this.database.client.query<CountRow>(
        `SELECT count(*) AS total
         FROM payments
         WHERE property_id = $1
           AND ($2::text IS NULL OR payment_status = $2)`,
        values,
      ),
      this.database.client.query<AdminPaymentRow>(
        `SELECT id, payment_code, payment_status, amount, paid_at, verified_at
         FROM payments
         WHERE property_id = $1
           AND ($2::text IS NULL OR payment_status = $2)
         ORDER BY paid_at DESC NULLS LAST, created_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [...values, limit, offset],
      ),
    ]);

    return { records: pageResult.rows, total: Number(countResult.rows[0]?.total ?? 0) };
  }
}
