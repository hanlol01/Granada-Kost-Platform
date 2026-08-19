import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { ExpenseRepository } from '../repositories/expense.repository';
import {
  CreateExpenseInput,
  ExpenseAuditContext,
  ExpensePaymentMethod,
  ExpenseRecord,
  ExpenseStatus,
} from '../types/expense.types';

type CommandOptions = {
  idempotencyKey: string;
  route: string;
  fingerprint: string;
  context: ExpenseAuditContext;
};

export const EXPENSE_HIGH_VALUE_THRESHOLD = 500_000;
export const EXPENSE_TRANSITIONS: Record<ExpenseStatus, readonly ExpenseStatus[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'cancelled'],
  paid: ['reversed'],
  rejected: ['archived'],
  cancelled: [],
  reversed: ['archived'],
  archived: [],
};

export function canTransitionExpense(from: ExpenseStatus, to: ExpenseStatus): boolean {
  return EXPENSE_TRANSITIONS[from].includes(to);
}

@Injectable()
export class ExpenseService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly database: DatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyIds: string[], status?: ExpenseStatus, limit?: number, offset?: number) {
    return this.expenses.list(propertyIds, status, limit, offset);
  }
  async get(id: string): Promise<ExpenseRecord> {
    const row = await this.expenses.findById(id);
    if (!row)
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    return row;
  }

  create(input: CreateExpenseInput, options: CommandOptions): Promise<ExpenseRecord> {
    return this.command(options, input.propertyId, input.createdByUserId, async (client, actor) => {
      const expense = await this.expenses.create(input, client);
      await this.expenses.addHistory(expense, null, 'draft', actor, 'Pengeluaran dibuat', client);
      await this.writeAudit('expense.created', expense, options.context, client);
      await this.outbox(expense, 'expense.created', options, actor, client);
      return expense;
    });
  }

  submit(id: string, actorUserId: string, options: CommandOptions): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'pending_approval', null, options, () => undefined);
  }

  approve(id: string, actorUserId: string, options: CommandOptions): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'approved', null, options, (expense) => {
      if (expense.amount >= EXPENSE_HIGH_VALUE_THRESHOLD) {
        throw new ConflictException({
          code: 'EXPENSE_HIGH_VALUE_REQUIRES_HIGHER_APPROVER',
          message: 'Pengeluaran Rp500.000 atau lebih tetap menunggu approver yang lebih tinggi.',
        });
      }
    });
  }

  reject(
    id: string,
    actorUserId: string,
    reason: string,
    options: CommandOptions,
  ): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'rejected', reason, options, (expense) => {
      if (expense.status !== 'pending_approval')
        throw new ConflictException({
          code: 'EXPENSE_REJECTION_REQUIRES_PENDING',
          message: 'Hanya pengeluaran yang menunggu persetujuan yang dapat ditolak.',
        });
      if (reason.trim().length < 3)
        throw new BadRequestException({
          code: 'EXPENSE_REJECTION_REASON_REQUIRED',
          message: 'Alasan penolakan wajib diisi.',
        });
    });
  }

  archive(id: string, actorUserId: string, options: CommandOptions): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'archived', null, options, (expense) => {
      if (expense.status !== 'rejected' && expense.status !== 'reversed')
        throw new ConflictException({
          code: 'EXPENSE_ARCHIVE_NOT_ALLOWED',
          message: 'Hanya pengeluaran ditolak atau dikoreksi yang dapat diarsipkan.',
        });
    });
  }

  pay(
    id: string,
    actorUserId: string,
    method: ExpensePaymentMethod,
    reference: string | null,
    options: CommandOptions,
  ): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'paid', null, options, async (expense, client) => {
      if (expense.status !== 'approved')
        throw new ConflictException({
          code: 'EXPENSE_APPROVAL_REQUIRED',
          message: 'Pengeluaran harus disetujui sebelum dibayar.',
        });
      await this.expenses.addPayment(expense, actorUserId, method, reference, client);
    });
  }

  cancel(
    id: string,
    actorUserId: string,
    reason: string,
    options: CommandOptions,
  ): Promise<ExpenseRecord> {
    return this.transition(id, actorUserId, 'cancelled', reason, options, (expense) => {
      if (expense.status === 'paid' || expense.status === 'reversed')
        throw new ConflictException({
          code: 'EXPENSE_CANCEL_NOT_ALLOWED',
          message: 'Pengeluaran yang sudah dibayar harus dibalik melalui koreksi.',
        });
    });
  }

  reverse(
    id: string,
    actorUserId: string,
    reason: string,
    options: CommandOptions,
  ): Promise<ExpenseRecord> {
    return this.transition(
      id,
      actorUserId,
      'reversed',
      reason,
      options,
      async (expense, client) => {
        if (expense.status !== 'paid')
          throw new ConflictException({
            code: 'EXPENSE_REVERSAL_REQUIRES_PAID',
            message: 'Hanya pengeluaran yang sudah dibayar yang dapat dikoreksi.',
          });
        await this.expenses.addReversal(expense, actorUserId, reason, client);
      },
    );
  }

  private async transition(
    id: string,
    actorUserId: string,
    next: ExpenseStatus,
    reason: string | null,
    options: CommandOptions,
    before: (expense: ExpenseRecord, client: PoolClient) => Promise<void> | void,
  ): Promise<ExpenseRecord> {
    const existing = await this.expenses.findById(id);
    if (!existing)
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    return this.command(options, existing.propertyId, actorUserId, async (client) => {
      const expense = await this.expenses.findById(id, client, true);
      if (!expense)
        throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
      await before(expense, client);
      if (!canTransitionExpense(expense.status, next))
        throw new ConflictException({
          code: 'EXPENSE_INVALID_TRANSITION',
          message: `Perubahan status ${expense.status} ke ${next} tidak diizinkan.`,
        });
      const updated = await this.expenses.setStatus(id, next, actorUserId, reason, client);
      if (!updated)
        throw new BadRequestException({
          code: 'EXPENSE_TRANSITION_FAILED',
          message: 'Perubahan status pengeluaran gagal.',
        });
      await this.expenses.addHistory(updated, expense.status, next, actorUserId, reason, client);
      await this.writeAudit(`expense.${next}`, updated, options.context, client, expense);
      await this.outbox(updated, `expense.${next}`, options, actorUserId, client);
      return updated;
    });
  }

  private async command<T>(
    options: CommandOptions,
    propertyId: string,
    actorUserId: string,
    operation: (client: PoolClient, actor: string) => Promise<T>,
  ): Promise<T> {
    const key = options.idempotencyKey.trim();
    if (key.length < 16 || key.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key harus 16 sampai 128 karakter.',
      });
    return this.database.transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO idempotency_commands (property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING RETURNING id`,
        [
          propertyId,
          actorUserId,
          options.route,
          key,
          options.fingerprint,
          options.context.correlationId ?? null,
        ],
      );
      if (!inserted.rows[0]) {
        const replay = await client.query<{
          request_fingerprint: string;
          command_status: string;
          response_body: { data: T } | null;
        }>(
          `SELECT request_fingerprint, command_status, response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [actorUserId, options.route, key],
        );
        const row = replay.rows[0];
        if (!row || row.request_fingerprint !== options.fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key sudah digunakan untuk payload berbeda.',
          });
        if (row.command_status !== 'succeeded' || !row.response_body)
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Perintah pengeluaran masih diproses.',
          });
        return row.response_body.data;
      }
      const result = await operation(client, actorUserId);
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded', response_status=200, response_body=$4::jsonb, resource_type='expense', resource_id=$5, completed_at=now() WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [
          actorUserId,
          options.route,
          key,
          JSON.stringify({ data: result }),
          (result as ExpenseRecord).id,
        ],
      );
      return result;
    });
  }

  private async writeAudit(
    action: string,
    expense: ExpenseRecord,
    context: ExpenseAuditContext,
    client: PoolClient,
    before?: ExpenseRecord,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: context.actorUserId,
        propertyId: expense.propertyId,
        action,
        resourceType: 'expense',
        resourceId: expense.id,
        beforeData: before ? this.safe(before) : undefined,
        afterData: this.safe(expense),
        resultStatus: 'success',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      },
      client,
    );
  }
  private async outbox(
    expense: ExpenseRecord,
    eventType: string,
    options: CommandOptions,
    actorUserId: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id) VALUES ($1,$2,$3,'expense',$4,$5::jsonb,$6,$7) ON CONFLICT (event_key) DO NOTHING`,
      [
        expense.propertyId,
        `${eventType}:${expense.id}:${options.idempotencyKey}`,
        eventType,
        expense.id,
        JSON.stringify({ expense_id: expense.id, status: expense.status, amount: expense.amount }),
        options.context.correlationId ?? null,
        actorUserId,
      ],
    );
  }
  private safe(expense: ExpenseRecord) {
    return {
      id: expense.id,
      propertyId: expense.propertyId,
      category: expense.category,
      amount: expense.amount,
      status: expense.status,
      expenseDate: expense.expenseDate,
      buildingId: expense.buildingId,
      workOrderId: expense.workOrderId,
    };
  }
  static fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
