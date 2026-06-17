import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateInvoiceInput,
  InvoiceLineItemRecord,
  InvoiceLineType,
  InvoiceRecord,
  InvoiceStatus,
  PaymentAllocationRecord,
} from '../types/billing.types';

type InvoiceRow = {
  id: string;
  property_id: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string;
  billing_period_id: string;
  invoice_code: string;
  invoice_status: InvoiceStatus;
  subtotal_amount: string;
  late_fee_amount: string;
  total_amount: string;
  due_date: string;
  issued_at: Date | null;
  paid_at: Date | null;
  voided_at: Date | null;
  void_reason: string | null;
  snapshot_period_key: string;
  snapshot_period_start_date: string;
  snapshot_period_end_date: string;
  snapshot_room_number: string;
  snapshot_resident_name: string;
  snapshot_monthly_price: string;
  created_at: Date;
  updated_at: Date;
};

type InvoiceLineItemRow = {
  id: string;
  invoice_id: string;
  line_type: InvoiceLineType;
  description: string;
  quantity: string;
  unit_amount: string;
  total_amount: string;
  sort_order: number;
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
export class InvoiceRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(propertyId: string, status?: InvoiceStatus, limit = 20, offset = 0): Promise<InvoiceRecord[]> {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT ${this.invoiceColumns()}
       FROM invoices
       WHERE property_id = $1
         AND ($2::text IS NULL OR invoice_status = $2)
       ORDER BY due_date DESC, created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyId, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.mapInvoice(row));
  }

  async listForProperties(propertyIds: string[], status?: InvoiceStatus, limit = 20, offset = 0): Promise<InvoiceRecord[]> {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT ${this.invoiceColumns()}
       FROM invoices
       WHERE property_id = ANY($1::uuid[])
         AND ($2::text IS NULL OR invoice_status = $2)
       ORDER BY due_date DESC, created_at DESC
       LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return result.rows.map((row) => this.mapInvoice(row));
  }

  async listForUser(userId: string, limit = 20, offset = 0): Promise<InvoiceRecord[]> {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT ${this.invoiceColumns('invoices')}
       FROM invoices
       JOIN residents ON residents.id = invoices.resident_id
       WHERE residents.user_id = $1
       ORDER BY invoices.due_date DESC, invoices.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map((row) => this.mapInvoice(row));
  }

  async findByIdForUser(invoiceId: string, userId: string): Promise<InvoiceRecord | null> {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT ${this.invoiceColumns('invoices')}
       FROM invoices
       JOIN residents ON residents.id = invoices.resident_id
       WHERE invoices.id = $1 AND residents.user_id = $2`,
      [invoiceId, userId],
    );
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
  }

  async findById(id: string): Promise<InvoiceRecord | null> {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT ${this.invoiceColumns()}
       FROM invoices
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
  }

  async create(input: CreateInvoiceInput): Promise<InvoiceRecord> {
    const result = await this.database.client.query<InvoiceRow>(
      `INSERT INTO invoices (
         property_id, resident_id, room_id, occupancy_id, billing_period_id, invoice_code,
         invoice_status, subtotal_amount, late_fee_amount, total_amount, due_date,
         snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date,
         snapshot_room_number, snapshot_resident_name, snapshot_monthly_price,
         created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, 0, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${this.invoiceColumns()}`,
      [
        input.propertyId,
        input.residentId,
        input.roomId,
        input.occupancyId,
        input.billingPeriodId,
        input.invoiceCode,
        input.subtotalAmount,
        input.dueDate,
        input.snapshotPeriodKey,
        input.snapshotPeriodStartDate,
        input.snapshotPeriodEndDate,
        input.snapshotRoomNumber,
        input.snapshotResidentName,
        input.snapshotMonthlyPrice,
        input.createdByUserId ?? null,
      ],
    );
    return this.mapInvoice(result.rows[0]);
  }

  async issue(id: string): Promise<InvoiceRecord | null> {
    const result = await this.database.client.query<InvoiceRow>(
      `UPDATE invoices
       SET invoice_status = 'issued',
           issued_at = COALESCE(issued_at, now()),
           updated_at = now()
       WHERE id = $1 AND invoice_status = 'draft'
       RETURNING ${this.invoiceColumns()}`,
      [id],
    );
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
  }

  async cancel(id: string, reason: string, actorUserId?: string): Promise<InvoiceRecord | null> {
    const result = await this.database.client.query<InvoiceRow>(
      `UPDATE invoices
       SET invoice_status = 'void',
           void_reason = $2,
           voided_by_user_id = $3,
           voided_at = now(),
           updated_at = now()
       WHERE id = $1 AND invoice_status <> 'paid'
       RETURNING ${this.invoiceColumns()}`,
      [id, reason, actorUserId ?? null],
    );
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
  }

  async updatePaymentStatus(id: string, outstandingAmount: number): Promise<InvoiceRecord | null> {
    const status: InvoiceStatus = outstandingAmount <= 0 ? 'paid' : 'partially_paid';
    const result = await this.database.client.query<InvoiceRow>(
      `UPDATE invoices
       SET invoice_status = $2,
           paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END,
           updated_at = now()
       WHERE id = $1 AND invoice_status <> 'void'
       RETURNING ${this.invoiceColumns()}`,
      [id, status],
    );
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : null;
  }

  async listLineItems(invoiceId: string): Promise<InvoiceLineItemRecord[]> {
    const result = await this.database.client.query<InvoiceLineItemRow>(
      `SELECT id, invoice_id, line_type, description, quantity::text, unit_amount,
              total_amount, sort_order
       FROM invoice_line_items
       WHERE invoice_id = $1
       ORDER BY sort_order, created_at`,
      [invoiceId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      lineType: row.line_type,
      description: row.description,
      quantity: row.quantity,
      unitAmount: Number(row.unit_amount),
      totalAmount: Number(row.total_amount),
      sortOrder: row.sort_order,
    }));
  }

  async listAllocations(invoiceId: string): Promise<PaymentAllocationRecord[]> {
    const result = await this.database.client.query<AllocationRow>(
      `SELECT id, payment_id, target_type, target_id, invoice_id, allocated_amount,
              allocation_status, allocated_at
       FROM payment_allocations
       WHERE invoice_id = $1
       ORDER BY allocated_at`,
      [invoiceId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      targetType: row.target_type,
      targetId: row.target_id,
      invoiceId: row.invoice_id,
      allocatedAmount: Number(row.allocated_amount),
      allocationStatus: row.allocation_status,
      allocatedAt: row.allocated_at,
    }));
  }

  async summaryForProperties(propertyIds: string[]): Promise<{
    totalInvoices: number;
    totalOutstandingAmount: number;
    overdueInvoices: number;
  }> {
    const result = await this.database.client.query<{
      total_invoices: string;
      total_outstanding_amount: string;
      overdue_invoices: string;
    }>(
      `SELECT count(*) AS total_invoices,
              COALESCE(sum(GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)), 0) AS total_outstanding_amount,
              count(*) FILTER (WHERE invoices.invoice_status = 'overdue') AS overdue_invoices
       FROM invoices
       LEFT JOIN (
         SELECT invoice_id, sum(allocated_amount) AS allocated_amount
         FROM payment_allocations
         WHERE allocation_status = 'active'
         GROUP BY invoice_id
       ) allocations ON allocations.invoice_id = invoices.id
       WHERE invoices.property_id = ANY($1::uuid[])
         AND invoices.invoice_status <> 'void'`,
      [propertyIds],
    );
    const row = result.rows[0];
    return {
      totalInvoices: Number(row.total_invoices),
      totalOutstandingAmount: Number(row.total_outstanding_amount),
      overdueInvoices: Number(row.overdue_invoices),
    };
  }

  private invoiceColumns(prefix?: string): string {
    const p = prefix ? `${prefix}.` : '';
    return `${p}id, ${p}property_id, ${p}resident_id, ${p}room_id, ${p}occupancy_id, ${p}billing_period_id, ${p}invoice_code,
            ${p}invoice_status, ${p}subtotal_amount, ${p}late_fee_amount, ${p}total_amount, ${p}due_date::text,
            ${p}issued_at, ${p}paid_at, ${p}voided_at, ${p}void_reason, ${p}snapshot_period_key,
            ${p}snapshot_period_start_date::text, ${p}snapshot_period_end_date::text,
            ${p}snapshot_room_number, ${p}snapshot_resident_name, ${p}snapshot_monthly_price,
            ${p}created_at, ${p}updated_at`;
  }

  private mapInvoice(row: InvoiceRow): InvoiceRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      residentId: row.resident_id,
      roomId: row.room_id,
      occupancyId: row.occupancy_id,
      billingPeriodId: row.billing_period_id,
      invoiceCode: row.invoice_code,
      invoiceStatus: row.invoice_status,
      subtotalAmount: Number(row.subtotal_amount),
      lateFeeAmount: Number(row.late_fee_amount),
      totalAmount: Number(row.total_amount),
      dueDate: row.due_date,
      issuedAt: row.issued_at,
      paidAt: row.paid_at,
      voidedAt: row.voided_at,
      voidReason: row.void_reason,
      snapshotPeriodKey: row.snapshot_period_key,
      snapshotPeriodStartDate: row.snapshot_period_start_date,
      snapshotPeriodEndDate: row.snapshot_period_end_date,
      snapshotRoomNumber: row.snapshot_room_number,
      snapshotResidentName: row.snapshot_resident_name,
      snapshotMonthlyPrice: Number(row.snapshot_monthly_price),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
