import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  CreateExpenseInput,
  ExpensePaymentMethod,
  ExpenseRecord,
  ExpenseStatus,
} from '../types/expense.types';

type QueryClient = Pool | PoolClient;
type ExpenseRow = {
  id: string;
  property_id: string;
  building_id: string | null;
  work_order_id: string | null;
  proof_file_id: string | null;
  category: string;
  expense_date: string;
  amount: string;
  payment_method: ExpensePaymentMethod;
  vendor_name: string | null;
  notes: string | null;
  expense_status: ExpenseStatus;
  created_by_user_id: string;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  paid_at: Date | null;
  rejected_at: Date | null;
  rejected_by_user_id: string | null;
  reject_reason: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  reversed_at: Date | null;
  archived_at: Date | null;
  archived_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ExpenseRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    propertyIds: string[],
    status?: ExpenseStatus,
    limit = 20,
    offset = 0,
  ): Promise<{ records: ExpenseRecord[]; total: number }> {
    if (!propertyIds.length) return { records: [], total: 0 };
    const count = await this.database.client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM expenses WHERE property_id = ANY($1::uuid[]) AND ($2::text IS NULL OR expense_status = $2)`,
      [propertyIds, status ?? null],
    );
    const result = await this.database.client.query<ExpenseRow>(
      `SELECT ${this.columns()} FROM expenses
       WHERE property_id = ANY($1::uuid[]) AND ($2::text IS NULL OR expense_status = $2)
       ORDER BY expense_date DESC, created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [propertyIds, status ?? null, limit, offset],
    );
    return {
      records: result.rows.map((row) => this.map(row)),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  async findById(
    id: string,
    client: QueryClient = this.database.client,
    forUpdate = false,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `SELECT ${this.columns()} FROM expenses WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async create(
    input: CreateExpenseInput,
    client: QueryClient = this.database.client,
  ): Promise<ExpenseRecord> {
    const result = await client.query<ExpenseRow>(
      `INSERT INTO expenses (property_id, building_id, work_order_id, proof_file_id, category, expense_date, amount, payment_method, vendor_name, notes, expense_status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,'draft',$11) RETURNING ${this.columns()}`,
      [
        input.propertyId,
        input.buildingId ?? null,
        input.workOrderId ?? null,
        input.proofFileId ?? null,
        input.category.trim(),
        input.expenseDate,
        input.amount,
        input.paymentMethod,
        input.vendorName?.trim() || null,
        input.notes?.trim() || null,
        input.createdByUserId,
      ],
    );
    return this.map(result.rows[0]);
  }

  async setStatus(
    id: string,
    status: ExpenseStatus,
    actorUserId: string,
    reason: string | null,
    client: PoolClient,
  ): Promise<ExpenseRecord | null> {
    const result = await client.query<ExpenseRow>(
      `UPDATE expenses SET expense_status=$2, approved_by_user_id=CASE WHEN $2='approved' THEN $3 ELSE approved_by_user_id END,
       approved_at=CASE WHEN $2='approved' THEN now() ELSE approved_at END,
       paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END,
       rejected_at=CASE WHEN $2='rejected' THEN now() ELSE rejected_at END,
       rejected_by_user_id=CASE WHEN $2='rejected' THEN $3 ELSE rejected_by_user_id END,
       reject_reason=CASE WHEN $2='rejected' THEN $4 ELSE reject_reason END,
       cancelled_at=CASE WHEN $2='cancelled' THEN now() ELSE cancelled_at END,
       cancelled_by_user_id=CASE WHEN $2='cancelled' THEN $3 ELSE cancelled_by_user_id END,
       cancel_reason=CASE WHEN $2='cancelled' THEN $4 ELSE cancel_reason END,
       reversed_at=CASE WHEN $2='reversed' THEN now() ELSE reversed_at END,
       archived_at=CASE WHEN $2='archived' THEN now() ELSE archived_at END,
       archived_by_user_id=CASE WHEN $2='archived' THEN $3 ELSE archived_by_user_id END,
       updated_at=now() WHERE id=$1 RETURNING ${this.columns()}`,
      [id, status, actorUserId, reason],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async addHistory(
    expense: ExpenseRecord,
    fromStatus: ExpenseStatus | null,
    toStatus: ExpenseStatus,
    actorUserId: string,
    reason: string | null,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO expense_status_histories (expense_id, property_id, from_status, to_status, reason, changed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [expense.id, expense.propertyId, fromStatus, toStatus, reason, actorUserId],
    );
  }

  async addPayment(
    expense: ExpenseRecord,
    actorUserId: string,
    method: ExpensePaymentMethod,
    reference: string | null,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO expense_payments (expense_id, property_id, amount, payment_method, reference, paid_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [expense.id, expense.propertyId, expense.amount, method, reference, actorUserId],
    );
  }

  async addReversal(
    expense: ExpenseRecord,
    actorUserId: string,
    reason: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO expense_reversals (expense_id, property_id, reversal_amount, reason, reversed_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
      [expense.id, expense.propertyId, expense.amount, reason, actorUserId],
    );
  }

  private columns(): string {
    return `id, property_id, building_id, work_order_id, proof_file_id, category, expense_date, amount, payment_method, vendor_name, notes, expense_status, created_by_user_id, approved_by_user_id, approved_at, paid_at, rejected_at, rejected_by_user_id, reject_reason, cancelled_at, cancel_reason, reversed_at, archived_at, archived_by_user_id, created_at, updated_at`;
  }
  private map(row: ExpenseRow): ExpenseRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      buildingId: row.building_id,
      workOrderId: row.work_order_id,
      proofFileId: row.proof_file_id,
      category: row.category,
      expenseDate: row.expense_date,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      vendorName: row.vendor_name,
      notes: row.notes,
      status: row.expense_status,
      createdByUserId: row.created_by_user_id,
      approvedByUserId: row.approved_by_user_id,
      approvedAt: row.approved_at,
      paidAt: row.paid_at,
      rejectedAt: row.rejected_at,
      rejectReason: row.reject_reason,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      reversedAt: row.reversed_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
