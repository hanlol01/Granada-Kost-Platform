import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  CancelScheduledTransferDto,
  DepositPaymentDto,
  ScheduleTransferLeaseDto,
  TransferLeaseDto,
  TransferLeasePreviewDto,
  TransferReasonCode,
} from './lease.dto';
import { dueDateWithinCycle, nextBillingStart, previousDate } from './lease-date.helper';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type { BillingCycle, IdempotentResult, LeaseAuditContext, LeaseStatus } from './lease.types';

type PropertyRow = {
  id: string;
  default_due_day: number | null;
};

type LeaseRow = {
  id: string;
  property_id: string;
  lease_code: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string;
  kost_type_id: string;
  lease_status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  snapshot_monthly_price: string;
  snapshot_yearly_price: string;
  snapshot_deposit_amount: string;
  snapshot_room_number: string;
  snapshot_kost_type_name: string;
  notes: string | null;
  deposit_collected_amount: string;
  deposit_deduction_amount: string;
  deposit_refunded_amount: string;
};

type RoomRow = {
  id: string;
  property_id: string;
  number: string;
  room_status: string;
  kost_type_id: string | null;
  room_gender_policy: string;
  building_gender_policy: string;
};

type ResidentRow = {
  id: string;
  property_id: string;
  full_name: string;
  resident_status: string;
  gender: string;
};

type OccupancyRow = {
  id: string;
  property_id: string;
  room_id: string;
  resident_id: string;
  occupancy_status: string;
};

type KostTypeRow = {
  id: string;
  property_id: string;
  name: string;
  monthly_price: string;
  yearly_price: string;
  deposit_amount: string;
  status: string;
  deleted_at: Date | null;
};

type InvoiceRow = {
  id: string;
  cycle_start_date: string | null;
  total_amount: string;
  invoice_status: string;
};

type LedgerRow = {
  id: string;
  transaction_type: string;
  direction: 'credit' | 'debit';
  amount: string;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: unknown;
};

type TransferRecordRow = {
  id: string;
  effective_date: string;
  carried_deposit_amount: string;
  required_target_deposit_amount: string;
  top_up_amount: string;
};

type PaymentRow = { id: string; payment_code: string };

type CommandOutput<T> = {
  resourceType: string;
  resourceId: string;
  data: T;
};

type TransferPath = 'end_period' | 'same_day_exception';

type TransferCommandRow = {
  id: string;
  property_id: string;
  resident_id: string;
  from_lease_id: string;
  from_room_id: string;
  to_room_id: string;
  transfer_path: TransferPath;
  effective_date: string;
  reason_code: TransferReasonCode;
  reason_detail: string | null;
  exception_reason: string | null;
  state: 'scheduled' | 'executed' | 'cancelled' | 'failed';
  failure_code: string | null;
  cancel_reason: string | null;
  commercial_snapshot: Record<string, unknown>;
  transfer_record_id: string | null;
  executed_late: boolean;
  created_by_user_id: string | null;
  created_at: string;
  executed_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
};

type CutoverInput = {
  user: UserAccessContext;
  context: LeaseAuditContext;
  propertyId: string;
  leaseId: string;
  targetRoomId: string;
  transferPath: TransferPath;
  reasonCode: TransferReasonCode;
  reasonDetail: string | null;
  exceptionReason: string | null;
  commandId: string | null;
  lateExecution: boolean;
  /**
   * The source lease's contractual end date snapshotted at schedule time.
   * Present only for scheduled commands; validated again at cutover so the
   * successor lease always inherits the surviving contractual term.
   */
  expectedSourceEndDate?: string | null;
  topUp?: { amount: number; payment: DepositPaymentDto };
};

const BOUNDARY_SEARCH_HORIZON = 24;

@Injectable()
export class LeaseTransferService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
  ) {}

  /** A non-binding, PII-safe estimate. The command validates everything again. */
  async preview(
    user: UserAccessContext,
    leaseId: string,
    dto: TransferLeasePreviewDto,
  ): Promise<{ data: Record<string, unknown> }> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    await this.features.assertTransferEnabled(scope.property_id);

    return this.leases.transaction(async (client) => {
      const today = await this.jakartaToday(client);
      const property = await this.lockProperty(client, scope.property_id);
      await this.features.assertTransferEnabled(scope.property_id, client);
      const source = await this.lockLease(client, leaseId, 'FOR SHARE');
      this.assertTransferableLease(source);
      const sourceNextBillingDate = this.currentOrNextBillingBoundary(source, today);
      if (source.room_id === dto.target_room_id) {
        throw new UnprocessableEntityException({
          code: 'TRANSFER_TARGET_ROOM_INVALID',
          message: 'Transfer target must differ from the source room',
        });
      }
      const transferPath = this.resolveTransferPath(dto, today);
      const validEffectiveDates =
        transferPath === 'end_period'
          ? this.futureBillingBoundaries(source, today).slice(0, 6)
          : [today];
      const effectiveDate = dto.effective_date ?? validEffectiveDates[0];
      if (!effectiveDate) {
        throw new UnprocessableEntityException({
          code: 'TRANSFER_EFFECTIVE_DATE_UNAVAILABLE',
          message: 'No valid transfer date is available for this lease',
        });
      }
      this.assertEffectiveDateForPath(transferPath, effectiveDate, today, source);

      const rooms = await this.lockRooms(client, [source.room_id, dto.target_room_id], 'FOR SHARE');
      const sourceRoom = rooms.get(source.room_id);
      const targetRoom = rooms.get(dto.target_room_id);
      if (!sourceRoom || !targetRoom) {
        throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
      }
      this.assertTargetRoom(scope.property_id, sourceRoom, targetRoom);
      const targetKostType = await this.lockKostType(
        client,
        targetRoom.kost_type_id as string,
        today,
      );
      this.assertTargetKostType(scope.property_id, targetKostType);
      const resident = await this.readResident(client, source.resident_id);
      this.assertGenderCompatibility(resident, targetRoom);

      const invoices = await this.readLeaseInvoices(client, source.id, 'FOR SHARE');
      const ledger = await this.readLedger(client, source.id, 'FOR SHARE');
      const carriedDeposit = this.ledgerBalance(ledger);
      if (carriedDeposit < 0) {
        throw new ConflictException({
          code: 'DEPOSIT_BALANCE_INVALID',
          message: 'Source lease has an invalid negative deposit balance',
        });
      }
      const targetRequiredDeposit = Number(targetKostType.deposit_amount);
      const topUpRequired = Math.max(0, targetRequiredDeposit - carriedDeposit);
      const currentCycleInvoiceExists = invoices.some(
        (invoice) => invoice.cycle_start_date === today,
      );
      const targetInvoiceWillBeIssued =
        sourceNextBillingDate === today && !currentCycleInvoiceExists;

      return {
        data: {
          transfer_path: transferPath,
          effective_date: effectiveDate,
          source_lease: this.safeLease(source, sourceRoom.number, source.snapshot_kost_type_name),
          target_room: {
            id: targetRoom.id,
            number: targetRoom.number,
            kost_type: { id: targetKostType.id, name: targetKostType.name },
            gender_compatible: true,
          },
          deposit: {
            carried_amount: carriedDeposit,
            target_required_amount: targetRequiredDeposit,
            top_up_required_amount: topUpRequired,
          },
          billing: {
            billing_cycle: source.billing_cycle,
            billing_anchor_day: source.billing_anchor_day,
            source_next_billing_date: sourceNextBillingDate,
            target_invoice_will_be_issued: targetInvoiceWillBeIssued,
            target_next_billing_date: targetInvoiceWillBeIssued
              ? nextBillingStart(today, source.billing_cycle, source.billing_anchor_day)
              : sourceNextBillingDate,
            due_day: property.default_due_day ?? 25,
            // The successor lease inherits the source contractual end date.
            contractual_end_date: source.end_date,
          },
          valid_effective_dates: validEffectiveDates,
          old_outstanding_amount: await this.outstandingAmount(
            client,
            invoices.map((invoice) => invoice.id),
          ),
        },
      };
    });
  }

  /**
   * W07B same-day exception path. Admin-only (enforced by controller RBAC).
   * Executes the full cutover immediately and requires an exception reason.
   */
  async transfer(
    user: UserAccessContext,
    leaseId: string,
    dto: TransferLeaseDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    await this.features.assertTransferEnabled(scope.property_id);
    if (dto.top_up) this.assertFinancialActor(user);

    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/transfer`,
      idempotencyKey,
      dto,
      context,
      201,
      async (client, today) => {
        this.assertSameDayExceptionDate(dto.effective_date, today);
        return this.runCutover(client, today, {
          user,
          context,
          propertyId: scope.property_id,
          leaseId,
          targetRoomId: dto.target_room_id,
          transferPath: 'same_day_exception',
          reasonCode: dto.reason_code,
          reasonDetail: dto.reason_detail?.trim() || null,
          exceptionReason: dto.exception_reason.trim(),
          commandId: null,
          lateExecution: false,
          topUp: dto.top_up
            ? { amount: dto.top_up.amount, payment: dto.top_up.payment }
            : undefined,
        });
      },
    );
  }

  /**
   * W07B normal path. Persists a scheduled command that executes only at the
   * effective billing-period boundary via LeaseTransferScheduler. No occupancy,
   * room, lease, or billing lifecycle mutation happens here.
   */
  async schedule(
    user: UserAccessContext,
    leaseId: string,
    dto: ScheduleTransferLeaseDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    await this.features.assertTransferEnabled(scope.property_id);

    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/transfer/schedule`,
      idempotencyKey,
      dto,
      context,
      201,
      async (client, today) => {
        const source = await this.lockLease(client, leaseId, 'FOR SHARE');
        this.assertTransferableLease(source);
        if (source.room_id === dto.target_room_id) {
          throw new UnprocessableEntityException({
            code: 'TRANSFER_TARGET_ROOM_INVALID',
            message: 'Transfer target must differ from the source room',
          });
        }
        this.assertFutureBoundaryDate(dto.effective_date, today, source);

        const rooms = await this.lockRooms(
          client,
          [source.room_id, dto.target_room_id],
          'FOR SHARE',
        );
        const sourceRoom = rooms.get(source.room_id);
        const targetRoom = rooms.get(dto.target_room_id);
        if (!sourceRoom || !targetRoom) {
          throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        }
        this.assertTargetRoom(scope.property_id, sourceRoom, targetRoom);
        const targetKostType = await this.lockKostType(
          client,
          targetRoom.kost_type_id as string,
          today,
        );
        this.assertTargetKostType(scope.property_id, targetKostType);
        const resident = await this.lockResident(client, source.resident_id);
        if (resident.property_id !== scope.property_id || resident.resident_status !== 'active') {
          throw new ConflictException({
            code: 'LEASE_RESIDENT_CONFLICT',
            message: 'Source resident is not active in this property',
          });
        }
        this.assertGenderCompatibility(resident, targetRoom);

        // W07B revision 3: a scheduled command must never be created when it
        // is already known to fail at execution. Deposit top-ups stay on the
        // authorized same-day exception path only (admin + lease.manage +
        // billing.manage), so any shortfall fails fast with a deterministic
        // error instead of producing a doomed scheduled command.
        const ledger = await this.readLedger(client, source.id, 'FOR SHARE');
        const carriedDeposit = this.ledgerBalance(ledger);
        if (carriedDeposit < 0) {
          throw new ConflictException({
            code: 'DEPOSIT_BALANCE_INVALID',
            message: 'Source lease has an invalid negative deposit balance',
          });
        }
        const requiredTargetDeposit = Number(targetKostType.deposit_amount);
        if (requiredTargetDeposit > carriedDeposit) {
          throw new UnprocessableEntityException({
            code: 'TRANSFER_SCHEDULE_TOP_UP_REQUIRED',
            message:
              'Scheduled transfers cannot collect a deposit top-up; settle the deposit gap through the authorized same-day exception path before scheduling',
          });
        }

        const competing = await client.query<{ id: string }>(
          `SELECT id FROM leases
           WHERE room_id = $1 AND lease_status = 'active'
           FOR SHARE`,
          [targetRoom.id],
        );
        if (competing.rows[0]) {
          throw new ConflictException({
            code: 'LEASE_ROOM_CONFLICT',
            message: 'Target room already has an active lease',
          });
        }

        const existing = await client.query<{ id: string }>(
          `SELECT id FROM lease_transfer_commands
           WHERE from_lease_id = $1 AND state = 'scheduled'`,
          [leaseId],
        );
        if (existing.rows[0]) {
          throw new ConflictException({
            code: 'TRANSFER_ALREADY_SCHEDULED',
            message: 'This lease already has a scheduled transfer command',
          });
        }

        const commercialSnapshot = {
          billing_cycle: source.billing_cycle,
          billing_anchor_day: source.billing_anchor_day,
          next_billing_date: this.currentOrNextBillingBoundary(source, today),
          snapshot_monthly_price: source.snapshot_monthly_price,
          snapshot_yearly_price: source.snapshot_yearly_price,
          snapshot_deposit_amount: source.snapshot_deposit_amount,
          // W07B revision 2: the original contractual end date travels with
          // the command and is validated again at cutover.
          source_end_date: source.end_date,
          carried_deposit_amount: carriedDeposit,
          required_target_deposit_amount: requiredTargetDeposit,
        };
        const commandResult = await client.query<TransferCommandRow>(
          `INSERT INTO lease_transfer_commands (
             property_id, resident_id, from_lease_id, from_room_id, to_room_id,
             transfer_path, effective_date, reason_code, reason_detail, exception_reason,
             state, commercial_snapshot, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, 'end_period', $6::date, $7, $8, NULL, 'scheduled', $9::jsonb, $10)
           RETURNING ${this.transferCommandColumns()}`,
          [
            scope.property_id,
            resident.id,
            source.id,
            sourceRoom.id,
            targetRoom.id,
            dto.effective_date,
            dto.reason_code,
            dto.reason_detail?.trim() || null,
            JSON.stringify(commercialSnapshot),
            user.id,
          ],
        );
        const command = commandResult.rows[0];

        await this.insertHistory(
          client,
          scope.property_id,
          source.id,
          'transfer_scheduled',
          user.id,
          today,
          {
            transfer_command_id: command.id,
            to_room_id: targetRoom.id,
            effective_date: dto.effective_date,
            reason_code: dto.reason_code,
          },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.transfer.schedule',
          'lease_transfer_command',
          command.id,
          { state: null },
          {
            from_lease_id: source.id,
            from_room_id: sourceRoom.id,
            to_room_id: targetRoom.id,
            effective_date: dto.effective_date,
            reason_code: dto.reason_code,
            state: 'scheduled',
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.transfer_scheduled:${command.id}`,
          eventType: 'lease.transfer_scheduled',
          aggregateType: 'lease_transfer_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            transfer_command_id: command.id,
            source_lease_id: source.id,
            target_room_id: targetRoom.id,
            effective_date: dto.effective_date,
            reason_code: dto.reason_code,
            transfer_path: 'end_period',
          },
        });

        return {
          resourceType: 'lease_transfer_command',
          resourceId: command.id,
          data: { scheduled_transfer: this.safeCommand(command) },
        };
      },
    );
  }

  /** Cancels a still-scheduled command. Never touches lease/room/occupancy/billing state. */
  async cancelScheduledTransfer(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CancelScheduledTransferDto,
    idempotencyKey: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    await this.features.assertTransferEnabled(scope.property_id);

    return this.executeCommand(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/transfers/${commandId}/cancel`,
      idempotencyKey,
      dto,
      context,
      200,
      async (client, today) => {
        await this.features.assertTransferEnabled(scope.property_id, client);
        const command = await this.lockTransferCommand(client, commandId);
        if (command.from_lease_id !== leaseId || command.property_id !== scope.property_id) {
          throw new NotFoundException({
            code: 'TRANSFER_COMMAND_NOT_FOUND',
            message: 'Transfer command not found for this lease',
          });
        }
        if (command.state !== 'scheduled') {
          throw new ConflictException({
            code: 'TRANSFER_COMMAND_NOT_CANCELLABLE',
            message: `Transfer command is already ${command.state}`,
          });
        }

        const cancelledResult = await client.query<TransferCommandRow>(
          `UPDATE lease_transfer_commands
           SET state = 'cancelled', cancel_reason = $2, cancelled_by_user_id = $3, cancelled_at = now()
           WHERE id = $1 AND state = 'scheduled'
           RETURNING ${this.transferCommandColumns()}`,
          [commandId, dto.reason.trim(), user.id],
        );
        const cancelled = cancelledResult.rows[0];

        await this.insertHistory(
          client,
          scope.property_id,
          command.from_lease_id,
          'transfer_cancelled',
          user.id,
          today,
          { transfer_command_id: command.id, cancel_reason: dto.reason.trim() },
        );
        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
          'lease.transfer.cancel',
          'lease_transfer_command',
          command.id,
          { state: 'scheduled' },
          { state: 'cancelled', cancel_reason: dto.reason.trim() },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.transfer_cancelled:${command.id}`,
          eventType: 'lease.transfer_cancelled',
          aggregateType: 'lease_transfer_command',
          aggregateId: command.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            transfer_command_id: command.id,
            source_lease_id: command.from_lease_id,
            target_room_id: command.to_room_id,
            effective_date: command.effective_date,
            cancel_reason: dto.reason.trim(),
          },
        });

        return {
          resourceType: 'lease_transfer_command',
          resourceId: command.id,
          data: { scheduled_transfer: this.safeCommand(cancelled) },
        };
      },
    );
  }

  /** Read-only command listing for the lease detail transfer panel. */
  async listTransferCommands(
    user: UserAccessContext,
    leaseId: string,
  ): Promise<{ data: { items: Record<string, unknown>[] } }> {
    const scope = await this.lookupLeaseScope(leaseId);
    this.assertPropertyScope(user, scope.property_id);
    await this.features.assertTransferEnabled(scope.property_id);

    const result = await this.leases.query<TransferCommandRow>(
      `SELECT ${this.transferCommandColumns()}
       FROM lease_transfer_commands
       WHERE from_lease_id = $1
       ORDER BY created_at DESC, id
       LIMIT 50`,
      [leaseId],
    );
    return { data: { items: result.rows.map((row) => this.safeCommand(row)) } };
  }

  /**
   * Scheduler-only execution entry (LeaseTransferScheduler). Runs the full
   * cutover for a due command inside one transaction. If cutover preconditions
   * no longer hold, the command is marked failed (terminal, manual review).
   * If the due date already passed, execution proceeds with an explicit
   * late-execution marker (lead ruling B3).
   */
  async executeScheduledTransfer(
    commandId: string,
    runId: string,
  ): Promise<{ state: 'executed' | 'skipped' | 'failed'; late: boolean; failure_code?: string }> {
    let late = false;
    try {
      const outcome = await this.leases.transaction(async (client) => {
        const command = await this.lockTransferCommand(client, commandId);
        if (command.state !== 'scheduled') return { state: 'skipped' as const };
        const enabledPropertyIds = await this.features.transferSchedulerEnabledPropertyIds(client);
        if (!enabledPropertyIds.includes(command.property_id)) {
          return { state: 'skipped' as const };
        }
        const today = await this.jakartaToday(client);
        late = command.effective_date < today;
        const snapshot = command.commercial_snapshot ?? {};
        const actor = await this.buildSchedulerActor(
          client,
          command.created_by_user_id,
          command.property_id,
        );
        await this.runCutover(client, today, {
          user: actor,
          context: { correlationId: runId },
          propertyId: command.property_id,
          leaseId: command.from_lease_id,
          targetRoomId: command.to_room_id,
          transferPath: command.transfer_path,
          reasonCode: command.reason_code,
          reasonDetail: command.reason_detail,
          exceptionReason: command.exception_reason,
          commandId: command.id,
          lateExecution: late,
          expectedSourceEndDate:
            'source_end_date' in snapshot
              ? ((snapshot as { source_end_date: string | null }).source_end_date ?? null)
              : undefined,
        });
        return { state: 'executed' as const };
      });
      return outcome.state === 'executed'
        ? { state: 'executed', late }
        : { state: 'skipped', late };
    } catch (error) {
      const terminalCode = this.classifyTerminalFailure(error);
      if (terminalCode === null) {
        // A genuine infrastructure failure (connection loss, restart, deadlock,
        // serialization failure) or an unknown error. The cutover transaction
        // already rolled back, so no partial lifecycle writes exist. The command
        // deliberately stays scheduled so the next run retries it.
        throw error;
      }
      await this.markCommandFailed(commandId, terminalCode, error, runId, late);
      return { state: 'failed', late, failure_code: terminalCode };
    }
  }

  /**
   * Decides whether a failed cutover is terminal (deterministic business or
   * integrity-constraint conflict) or should stay scheduled for retry.
   *
   * Returns a stable failure_code for terminal failures, or null when the error
   * is a transient/unknown infrastructure failure that must be retried.
   */
  private classifyTerminalFailure(error: unknown): string | null {
    // Business rule violations already surface as HttpExceptions and are terminal.
    if (error instanceof HttpException) {
      return this.extractFailureCode(error);
    }
    // Reuse the shared PostgreSQL conflict translation so a recognised
    // constraint (resident/room) yields the same stable code as the synchronous
    // transfer path instead of a duplicated mapping.
    const translated = this.translateKnownDatabaseConflict(error);
    if (translated) {
      return this.extractFailureCode(translated);
    }
    // Any remaining integrity-constraint violation (SQLSTATE class 23, notably
    // 23505 unique_violation) is deterministic: retrying cannot succeed, so it
    // becomes a terminal failure with a stable code. Concurrency failures such
    // as deadlock (40P01) and serialization (40001), connection loss (class 08),
    // and shutdown (class 57) are NOT in class 23 and therefore stay retryable.
    const sqlState = this.databaseErrorCode(error);
    if (sqlState !== null && sqlState.startsWith('23')) {
      return 'TRANSFER_CONSTRAINT_CONFLICT';
    }
    return null;
  }

  /**
   * Runs the error through the existing conflict translator, capturing the
   * HttpException it raises for recognised constraints. Returns null when the
   * helper rethrows the original (unrecognised) error.
   */
  private translateKnownDatabaseConflict(error: unknown): HttpException | null {
    try {
      this.rethrowKnownDatabaseConflict(error);
    } catch (translated) {
      if (translated instanceof HttpException) return translated;
    }
    return null;
  }

  private databaseErrorCode(error: unknown): string | null {
    if (error instanceof Error && 'code' in error) {
      const code = (error as Error & { code?: unknown }).code;
      if (typeof code === 'string' && code.length > 0) return code;
    }
    return null;
  }

  /**
   * Shared cutover used by both transfer paths. Lock order stays M6-stable:
   * property, source lease, sorted room ids, resident, occupancy, invoices,
   * then ledger. Scheduled execution locks its command row before this call.
   */
  private async runCutover(
    client: PoolClient,
    today: string,
    input: CutoverInput,
  ): Promise<CommandOutput<Record<string, unknown>>> {
    const property = await this.lockProperty(client, input.propertyId);
    await this.features.assertTransferEnabled(input.propertyId, client);
    const source = await this.lockLease(client, input.leaseId, 'FOR UPDATE');
    this.assertTransferableLease(source);
    const sourceNextBillingDate = this.currentOrNextBillingBoundary(source, today);
    // W07B revision 2: the contractual end date snapshotted when the command
    // was scheduled must still hold at cutover; otherwise the command fails
    // for manual review instead of inheriting a stale term.
    if (
      input.expectedSourceEndDate !== undefined &&
      input.expectedSourceEndDate !== source.end_date
    ) {
      throw new ConflictException({
        code: 'TRANSFER_SOURCE_END_DATE_CHANGED',
        message: 'The source lease contractual end date changed after the transfer was scheduled',
      });
    }
    if (source.room_id === input.targetRoomId) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_TARGET_ROOM_INVALID',
        message: 'Transfer target must differ from the source room',
      });
    }

    const rooms = await this.lockRooms(client, [source.room_id, input.targetRoomId], 'FOR UPDATE');
    const sourceRoom = rooms.get(source.room_id);
    const targetRoom = rooms.get(input.targetRoomId);
    if (!sourceRoom || !targetRoom) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    this.assertTargetRoom(input.propertyId, sourceRoom, targetRoom);
    const targetKostType = await this.lockKostType(
      client,
      targetRoom.kost_type_id as string,
      today,
    );
    this.assertTargetKostType(input.propertyId, targetKostType);

    const resident = await this.lockResident(client, source.resident_id);
    if (resident.property_id !== input.propertyId || resident.resident_status !== 'active') {
      throw new ConflictException({
        code: 'LEASE_RESIDENT_CONFLICT',
        message: 'Source resident is not active in this property',
      });
    }
    this.assertGenderCompatibility(resident, targetRoom);

    const occupancy = await this.lockOccupancy(client, source.occupancy_id);
    if (
      occupancy.property_id !== input.propertyId ||
      occupancy.room_id !== source.room_id ||
      occupancy.resident_id !== source.resident_id ||
      occupancy.occupancy_status !== 'active'
    ) {
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Source lease occupancy is no longer active',
      });
    }
    const invoices = await this.readLeaseInvoices(client, source.id, 'FOR UPDATE');
    const ledger = await this.readLedger(client, source.id, 'FOR UPDATE');

    const competing = await client.query<{ id: string }>(
      `SELECT id FROM leases
       WHERE room_id = $1 AND lease_status = 'active'
       FOR UPDATE`,
      [targetRoom.id],
    );
    if (competing.rows[0]) {
      throw new ConflictException({
        code: 'LEASE_ROOM_CONFLICT',
        message: 'Target room already has an active lease',
      });
    }

    const carriedDeposit = this.ledgerBalance(ledger);
    if (carriedDeposit < 0) {
      throw new ConflictException({
        code: 'DEPOSIT_BALANCE_INVALID',
        message: 'Source lease has an invalid negative deposit balance',
      });
    }
    const requiredTargetDeposit = Number(targetKostType.deposit_amount);
    const requiredTopUp = Math.max(0, requiredTargetDeposit - carriedDeposit);
    this.assertTopUpAmount(input.topUp, requiredTopUp);
    if (input.topUp) this.assertFinancialActor(input.user);

    const sourceCurrentCycleInvoiceExists = invoices.some(
      (invoice) => invoice.cycle_start_date === today,
    );
    const issueTargetInvoice = sourceNextBillingDate === today && !sourceCurrentCycleInvoiceExists;
    const targetNextBillingDate =
      sourceNextBillingDate === today
        ? nextBillingStart(today, source.billing_cycle, source.billing_anchor_day)
        : sourceNextBillingDate;
    const outstandingAmount = await this.outstandingAmount(
      client,
      invoices.map((invoice) => invoice.id),
      true,
    );

    // The old active rows are ended before target active rows are inserted,
    // preserving partial-unique resident and room invariants in one tx.
    await client.query(
      `UPDATE occupancies
       SET occupancy_status = 'transferred', end_date = $2::date,
           closed_by_user_id = $3, updated_at = now()
       WHERE id = $1`,
      [source.occupancy_id, today, input.user.id],
    );
    const transferredSourceResult = await client.query<LeaseRow>(
      `UPDATE leases
       SET lease_status = 'transferred', end_date = $2::date, closed_at = now(),
           closed_by_user_id = $3, close_reason = $4, updated_by_user_id = $3, updated_at = now()
       WHERE id = $1
       RETURNING ${this.leaseColumns()}`,
      [source.id, today, input.user.id, this.transferCloseReason(input)],
    );
    const transferredSource = transferredSourceResult.rows[0];

    const targetOccupancyResult = await client.query<{ id: string }>(
      `INSERT INTO occupancies (
         property_id, room_id, resident_id, start_date, occupancy_status, created_by_user_id
       ) VALUES ($1, $2, $3, $4::date, 'active', $5)
       RETURNING id`,
      [input.propertyId, targetRoom.id, resident.id, today, input.user.id],
    );
    const targetOccupancyId = targetOccupancyResult.rows[0].id;
    const targetLeaseCode = this.newLeaseCode(today);
    const targetLeaseResult = await client.query<LeaseRow>(
      `INSERT INTO leases (
         property_id, lease_code, resident_id, room_id, occupancy_id, kost_type_id,
         lease_status, start_date, end_date, billing_cycle, billing_anchor_day, next_billing_date,
         snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount,
         snapshot_room_number, snapshot_kost_type_name, notes, transferred_from_lease_id,
         created_by_user_id, updated_by_user_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'active', $7::date, $8::date, $9, $10, $11::date,
         $12, $13, $14, $15, $16, $17, $18, $19, $19
       )
       RETURNING ${this.leaseColumns()}`,
      [
        input.propertyId,
        targetLeaseCode,
        resident.id,
        targetRoom.id,
        targetOccupancyId,
        targetKostType.id,
        today,
        // W07B revision 2: the successor lease inherits the source lease's
        // original contractual end date; the source closes at the transfer
        // date while the contractual term survives on the successor.
        source.end_date,
        source.billing_cycle,
        source.billing_anchor_day,
        targetNextBillingDate,
        targetKostType.monthly_price,
        targetKostType.yearly_price,
        targetKostType.deposit_amount,
        targetRoom.number,
        targetKostType.name,
        source.notes,
        source.id,
        input.user.id,
      ],
    );
    const targetLease = targetLeaseResult.rows[0];

    const transferRecordResult = await client.query<TransferRecordRow>(
      `INSERT INTO room_transfer_records (
         property_id, resident_id, from_lease_id, to_lease_id, from_room_id, to_room_id,
         effective_date, reason, carried_deposit_amount, required_target_deposit_amount,
         top_up_amount, created_by_user_id, transfer_command_id, transfer_path, reason_code,
         reason_detail, exception_reason, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
       RETURNING id, effective_date::text, carried_deposit_amount, required_target_deposit_amount,
                 top_up_amount`,
      [
        input.propertyId,
        resident.id,
        source.id,
        targetLease.id,
        sourceRoom.id,
        targetRoom.id,
        today,
        this.transferCloseReason(input),
        carriedDeposit,
        requiredTargetDeposit,
        requiredTopUp,
        input.user.id,
        input.commandId,
        input.transferPath,
        input.reasonCode,
        input.reasonDetail,
        input.exceptionReason,
        JSON.stringify({
          late_execution: input.lateExecution,
          source_end_date: source.end_date,
        }),
      ],
    );
    const transferRecord = transferRecordResult.rows[0];

    if (input.commandId) {
      await client.query(
        `UPDATE lease_transfer_commands
         SET state = 'executed', executed_at = now(), transfer_record_id = $1, executed_late = $2
         WHERE id = $3 AND state = 'scheduled'`,
        [transferRecord.id, input.lateExecution, input.commandId],
      );
    }

    // W07B decision 6: revoke active resident smart-lock grants scoped to the
    // old room at cutover. New-room access is issued only through the existing
    // canonical smart-lock access policy, never by the transfer itself.
    const revokedGrants = await client.query<{ id: string }>(
      `UPDATE smart_lock_access_grants
       SET grant_status = 'revoked', revoked_at = now(), revoke_reason = 'transfer', updated_at = now()
       WHERE resident_id = $1
         AND grant_type = 'resident'
         AND grant_status = 'active'
         AND smart_lock_device_id IN (SELECT id FROM smart_lock_devices WHERE room_id = $2)
       RETURNING id`,
      [resident.id, sourceRoom.id],
    );
    for (const revoked of revokedGrants.rows) {
      await this.writeAudit(
        client,
        input.user.id,
        input.propertyId,
        'smart_lock.grant_revoke',
        'smart_lock_access_grant',
        revoked.id,
        { grant_status: 'active', room_id: sourceRoom.id },
        { grant_status: 'revoked', revoke_reason: 'transfer' },
        input.context,
      );
    }
    if (revokedGrants.rows.length > 0) {
      await this.writeOutbox(client, {
        propertyId: input.propertyId,
        eventKey: `smart_lock.grants_revoked_for_transfer:${transferRecord.id}`,
        eventType: 'smart_lock.grants_revoked_for_transfer',
        aggregateType: 'room_transfer',
        aggregateId: transferRecord.id,
        actorUserId: input.user.id,
        correlationId: input.context.correlationId,
        payload: {
          transfer_record_id: transferRecord.id,
          resident_id: resident.id,
          room_id: sourceRoom.id,
          revoked_grant_ids: revokedGrants.rows.map((row) => row.id),
        },
      });
    }

    await this.insertLedger(client, {
      propertyId: input.propertyId,
      leaseId: source.id,
      transactionType: 'carry_forward',
      direction: 'debit',
      amount: carriedDeposit,
      transferRecordId: transferRecord.id,
      reasonType: 'transfer',
      reason: 'Lease transfer carry-forward',
      metadata: { counterpart_lease_id: targetLease.id },
      actorUserId: input.user.id,
    });
    await this.insertLedger(client, {
      propertyId: input.propertyId,
      leaseId: targetLease.id,
      transactionType: 'carry_forward',
      direction: 'credit',
      amount: carriedDeposit,
      transferRecordId: transferRecord.id,
      reasonType: 'transfer',
      reason: 'Lease transfer carry-forward',
      metadata: { counterpart_lease_id: source.id },
      actorUserId: input.user.id,
    });

    let topUpPayment: PaymentRow | null = null;
    if (input.topUp) {
      topUpPayment = await this.createVerifiedDepositPayment(
        client,
        input.propertyId,
        resident.id,
        input.topUp.amount,
        input.topUp.payment,
        input.user.id,
      );
      await client.query(
        `INSERT INTO payment_allocations (payment_id, target_type, target_id, allocated_amount)
         VALUES ($1, 'deposit', $2, $3)`,
        [topUpPayment.id, targetLease.id, input.topUp.amount],
      );
      await this.insertLedger(client, {
        propertyId: input.propertyId,
        leaseId: targetLease.id,
        transactionType: 'top_up',
        direction: 'credit',
        amount: input.topUp.amount,
        paymentId: topUpPayment.id,
        reasonType: 'verified_payment',
        metadata: {
          payment_code: topUpPayment.payment_code,
          transfer_record_id: transferRecord.id,
        },
        actorUserId: input.user.id,
      });
    }

    await this.refreshDepositCache(client, source.id, input.user.id);
    const targetDeposit = await this.refreshDepositCache(client, targetLease.id, input.user.id);

    // W07B decision 5: the old room enters inspection_required at cutover. It
    // can only leave that state through the authorized inspection-resolution
    // command, never through a direct status patch.
    await client.query(
      `UPDATE rooms
       SET room_status = CASE WHEN id = $1 THEN 'inspection_required' ELSE 'occupied' END,
           updated_by_user_id = $3, updated_at = now()
       WHERE id = ANY($2::uuid[])`,
      [sourceRoom.id, [sourceRoom.id, targetRoom.id], input.user.id],
    );
    await this.insertOccupancyHistory(
      client,
      source.occupancy_id,
      input.propertyId,
      sourceRoom.id,
      resident.id,
      'transfer_out',
      'active',
      'transferred',
      today,
      input.user.id,
      { transfer_record_id: transferRecord.id },
    );
    await this.insertOccupancyHistory(
      client,
      targetOccupancyId,
      input.propertyId,
      targetRoom.id,
      resident.id,
      'transfer_in',
      null,
      'active',
      today,
      input.user.id,
      { transfer_record_id: transferRecord.id },
    );
    await this.insertHistory(
      client,
      input.propertyId,
      source.id,
      'transferred_out',
      input.user.id,
      today,
      {
        transfer_record_id: transferRecord.id,
        to_lease_id: targetLease.id,
        to_room_id: targetRoom.id,
        carried_deposit_amount: carriedDeposit,
        transfer_path: input.transferPath,
        late_execution: input.lateExecution,
        reason_code: input.reasonCode,
      },
    );
    await this.insertHistory(
      client,
      input.propertyId,
      targetLease.id,
      'transferred_in',
      input.user.id,
      today,
      {
        transfer_record_id: transferRecord.id,
        from_lease_id: source.id,
        from_room_id: sourceRoom.id,
        carried_deposit_amount: carriedDeposit,
        top_up_amount: requiredTopUp,
        transfer_path: input.transferPath,
        late_execution: input.lateExecution,
      },
    );

    let targetInvoice: {
      id: string;
      invoice_code: string;
      due_date: string;
      total_amount: number;
    } | null = null;
    if (issueTargetInvoice) {
      targetInvoice = await this.issueTargetCycleInvoice(
        client,
        property,
        targetLease,
        resident,
        targetOccupancyId,
        today,
        input.user.id,
      );
      await this.insertHistory(
        client,
        input.propertyId,
        targetLease.id,
        'invoice_generated',
        input.user.id,
        today,
        { invoice_id: targetInvoice.id, amount: targetInvoice.total_amount },
      );
      await this.writeOutbox(client, {
        propertyId: input.propertyId,
        eventKey: `billing.invoice_issued:${targetInvoice.id}`,
        eventType: 'billing.invoice_issued',
        aggregateType: 'invoice',
        aggregateId: targetInvoice.id,
        actorUserId: input.user.id,
        correlationId: input.context.correlationId,
        payload: {
          invoice_id: targetInvoice.id,
          lease_id: targetLease.id,
          amount: targetInvoice.total_amount,
        },
      });
    }

    await this.writeAudit(
      client,
      input.user.id,
      input.propertyId,
      'lease.transfer',
      'room_transfer',
      transferRecord.id,
      {
        source_lease_id: source.id,
        source_room_id: sourceRoom.id,
        source_status: 'active',
      },
      {
        target_lease_id: targetLease.id,
        target_room_id: targetRoom.id,
        carried_deposit_amount: carriedDeposit,
        top_up_amount: requiredTopUp,
        reason_code: input.reasonCode,
        transfer_path: input.transferPath,
        late_execution: input.lateExecution,
        revoked_smart_lock_grant_count: revokedGrants.rows.length,
      },
      input.context,
    );
    await this.writeOutbox(client, {
      propertyId: input.propertyId,
      eventKey: `lease.transferred:${transferRecord.id}`,
      eventType: 'lease.transferred',
      aggregateType: 'room_transfer',
      aggregateId: transferRecord.id,
      actorUserId: input.user.id,
      correlationId: input.context.correlationId,
      payload: {
        transfer_record_id: transferRecord.id,
        source_lease_id: source.id,
        target_lease_id: targetLease.id,
        source_room_id: sourceRoom.id,
        target_room_id: targetRoom.id,
        carried_deposit_amount: carriedDeposit,
        top_up_amount: requiredTopUp,
        reason_code: input.reasonCode,
        transfer_path: input.transferPath,
        late_execution: input.lateExecution,
      },
    });

    return {
      resourceType: 'room_transfer',
      resourceId: transferRecord.id,
      data: {
        transfer_command_id: input.commandId,
        transfer_path: input.transferPath,
        executed_late: input.lateExecution,
        source_lease: this.safeLease(
          transferredSource,
          sourceRoom.number,
          source.snapshot_kost_type_name,
        ),
        target_lease: this.safeLease(targetLease, targetRoom.number, targetKostType.name),
        transfer_record: {
          id: transferRecord.id,
          effective_date: transferRecord.effective_date,
          from_room_id: sourceRoom.id,
          to_room_id: targetRoom.id,
          carried_deposit_amount: Number(transferRecord.carried_deposit_amount),
          required_target_deposit_amount: Number(transferRecord.required_target_deposit_amount),
          top_up_amount: Number(transferRecord.top_up_amount),
        },
        deposit: targetDeposit,
        top_up_payment: topUpPayment
          ? {
              id: topUpPayment.id,
              payment_code: topUpPayment.payment_code,
              payment_status: 'verified',
            }
          : null,
        target_invoice: targetInvoice,
        smart_lock_revocation: {
          revoked_grant_count: revokedGrants.rows.length,
          revoked_grant_ids: revokedGrants.rows.map((row) => row.id),
        },
        contractual_end_date: targetLease.end_date,
        old_outstanding_amount: outstandingAmount,
      },
    };
  }

  private async executeCommand<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    status: number,
    operation: (client: PoolClient, today: string) => Promise<CommandOutput<T>>,
  ): Promise<IdempotentResult<T>> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.requestFingerprint({
      route,
      actor_id: user.id,
      property_id: propertyId,
      payload,
    });
    try {
      return await this.leases.transaction(async (client) => {
        const command = await this.claimCommand(
          client,
          propertyId,
          user.id,
          route,
          key,
          fingerprint,
          context.correlationId,
        );
        if (command) {
          return { status: command.status, body: command.body as { data: T }, replayed: true };
        }
        const today = await this.jakartaToday(client);
        const result = await operation(client, today);
        const body = { data: result.data };
        await client.query(
          `UPDATE idempotency_commands
           SET command_status = 'succeeded', response_status = $2, response_body = $3::jsonb,
               resource_type = $4, resource_id = $5, completed_at = now()
           WHERE actor_user_id = $1 AND route = $6 AND idempotency_key = $7`,
          [
            user.id,
            status,
            JSON.stringify(body),
            result.resourceType,
            result.resourceId,
            route,
            key,
          ],
        );
        return { status, body, replayed: false };
      });
    } catch (error) {
      this.rethrowKnownDatabaseConflict(error);
    }
  }

  private async claimCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<{ status: number; body: { data: unknown } } | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_status, response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, key],
    );
    const row = existing.rows[0];
    if (!row || row.command_status === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command is still in progress',
      });
    }
    if (row.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (!row.response_status || !row.response_body || typeof row.response_body !== 'object') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    return { status: row.response_status, body: row.response_body as { data: unknown } };
  }

  private async lookupLeaseScope(leaseId: string): Promise<{ property_id: string }> {
    const result = await this.leases.query<{ property_id: string }>(
      `SELECT property_id FROM leases WHERE id = $1`,
      [leaseId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    }
    return result.rows[0];
  }

  private async lockProperty(client: PoolClient, propertyId: string): Promise<PropertyRow> {
    const result = await client.query<PropertyRow>(
      `SELECT properties.id, COALESCE(property_settings.default_due_day, 25) AS default_due_day
       FROM properties
       LEFT JOIN property_settings ON property_settings.property_id = properties.id
       WHERE properties.id = $1 AND properties.status = 'active'
       FOR SHARE OF properties`,
      [propertyId],
    );
    if (!result.rows[0]) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_NOT_ACTIVE',
        message: 'Property is not active',
      });
    }
    return result.rows[0];
  }

  private async lockLease(
    client: PoolClient,
    leaseId: string,
    lock: 'FOR UPDATE' | 'FOR SHARE',
  ): Promise<LeaseRow> {
    const result = await client.query<LeaseRow>(
      `SELECT ${this.leaseColumns()} FROM leases WHERE id = $1 ${lock}`,
      [leaseId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    }
    return result.rows[0];
  }

  private async lockRooms(
    client: PoolClient,
    roomIds: string[],
    lock: 'FOR UPDATE' | 'FOR SHARE',
  ): Promise<Map<string, RoomRow>> {
    const uniqueSortedIds = [...new Set(roomIds)].sort();
    const result = await client.query<RoomRow>(
      `SELECT rooms.id, rooms.property_id, rooms.number, rooms.room_status, rooms.kost_type_id,
              rooms.gender_policy AS room_gender_policy,
              room_buildings.gender_policy AS building_gender_policy
       FROM rooms
       JOIN room_buildings ON room_buildings.id = rooms.building_id
       WHERE rooms.id = ANY($1::uuid[])
       ORDER BY rooms.id
       ${lock}`,
      [uniqueSortedIds],
    );
    return new Map(result.rows.map((row) => [row.id, row]));
  }

  private async lockKostType(
    client: PoolClient,
    kostTypeId: string,
    effectiveDate: string,
  ): Promise<KostTypeRow> {
    const result = await client.query<KostTypeRow>(
      `SELECT kost_type.id, kost_type.property_id, kost_type.name,
              commercial_version.monthly_price,
              commercial_version.annual_contract_value AS yearly_price,
              (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
                AS deposit_amount,
              kost_type.status, kost_type.deleted_at
       FROM kost_types kost_type
       JOIN LATERAL (
         SELECT version.monthly_price, version.annual_contract_value,
                version.security_deposit_months
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= $2::date
         ORDER BY version.effective_date DESC, version.id DESC
         LIMIT 1
       ) commercial_version ON true
       WHERE kost_type.id = $1
       FOR SHARE OF kost_type`,
      [kostTypeId, effectiveDate],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'KOST_TYPE_NOT_FOUND', message: 'Kost type not found' });
    }
    return result.rows[0];
  }

  private async lockResident(client: PoolClient, residentId: string): Promise<ResidentRow> {
    const result = await client.query<ResidentRow>(
      `SELECT id, property_id, full_name, resident_status, gender
       FROM residents WHERE id = $1 FOR UPDATE`,
      [residentId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    }
    return result.rows[0];
  }

  private async readResident(client: PoolClient, residentId: string): Promise<ResidentRow> {
    const result = await client.query<ResidentRow>(
      `SELECT id, property_id, full_name, resident_status, gender
       FROM residents WHERE id = $1 FOR SHARE`,
      [residentId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'RESIDENT_NOT_FOUND', message: 'Resident not found' });
    }
    return result.rows[0];
  }

  private async lockOccupancy(client: PoolClient, occupancyId: string): Promise<OccupancyRow> {
    const result = await client.query<OccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, occupancy_status
       FROM occupancies WHERE id = $1 FOR UPDATE`,
      [occupancyId],
    );
    if (!result.rows[0]) {
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Source lease occupancy is missing',
      });
    }
    return result.rows[0];
  }

  private async readLeaseInvoices(
    client: PoolClient,
    leaseId: string,
    lock: 'FOR UPDATE' | 'FOR SHARE',
  ): Promise<InvoiceRow[]> {
    const result = await client.query<InvoiceRow>(
      `SELECT id, cycle_start_date::text, total_amount, invoice_status
       FROM invoices
       WHERE lease_id = $1
       ORDER BY id
       ${lock}`,
      [leaseId],
    );
    return result.rows;
  }

  private async readLedger(
    client: PoolClient,
    leaseId: string,
    lock: 'FOR UPDATE' | 'FOR SHARE',
  ): Promise<LedgerRow[]> {
    const result = await client.query<LedgerRow>(
      `SELECT id, transaction_type, direction, amount
       FROM lease_deposit_transactions
       WHERE lease_id = $1
       ORDER BY created_at, id
       ${lock}`,
      [leaseId],
    );
    return result.rows;
  }

  private async outstandingAmount(
    client: PoolClient,
    invoiceIds: string[],
    lockAllocations = false,
  ): Promise<number> {
    if (!invoiceIds.length) return 0;
    if (lockAllocations) {
      await client.query(
        `SELECT id FROM payment_allocations WHERE invoice_id = ANY($1::uuid[]) FOR UPDATE`,
        [invoiceIds],
      );
    }
    const result = await client.query<{ outstanding_amount: string }>(
      `SELECT COALESCE(sum(GREATEST(invoices.total_amount - COALESCE(allocations.allocated_amount, 0), 0)), 0)
                 AS outstanding_amount
       FROM invoices
       LEFT JOIN (
         SELECT invoice_id, sum(allocated_amount) AS allocated_amount
         FROM payment_allocations
         WHERE allocation_status = 'active' AND invoice_id = ANY($1::uuid[])
         GROUP BY invoice_id
       ) allocations ON allocations.invoice_id = invoices.id
       WHERE invoices.id = ANY($1::uuid[]) AND invoices.invoice_status <> 'void'`,
      [invoiceIds],
    );
    return Number(result.rows[0]?.outstanding_amount ?? 0);
  }

  private async insertLedger(
    client: PoolClient,
    input: {
      propertyId: string;
      leaseId: string;
      transactionType: 'carry_forward' | 'top_up';
      direction: 'credit' | 'debit';
      amount: number;
      paymentId?: string | null;
      transferRecordId?: string | null;
      reasonType?: string | null;
      reason?: string | null;
      metadata: Record<string, unknown>;
      actorUserId: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_deposit_transactions (
         property_id, lease_id, transaction_type, direction, amount, payment_id, transfer_record_id,
         reason_type, reason, settlement_status, metadata, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', $10::jsonb, $11)`,
      [
        input.propertyId,
        input.leaseId,
        input.transactionType,
        input.direction,
        input.amount,
        input.paymentId ?? null,
        input.transferRecordId ?? null,
        input.reasonType ?? null,
        input.reason ?? null,
        JSON.stringify(input.metadata),
        input.actorUserId,
      ],
    );
  }

  private async refreshDepositCache(client: PoolClient, leaseId: string, actorUserId: string) {
    const result = await client.query<{
      deposit_collected_amount: string;
      deposit_deduction_amount: string;
      deposit_refunded_amount: string;
      snapshot_deposit_amount: string;
    }>(
      `WITH totals AS (
         SELECT
           COALESCE(sum(amount) FILTER (WHERE transaction_type IN ('collection', 'top_up') AND direction = 'credit'), 0) AS collected,
           COALESCE(sum(amount) FILTER (WHERE transaction_type = 'deduction' AND direction = 'debit'), 0) AS deducted,
           COALESCE(sum(amount) FILTER (WHERE transaction_type = 'refund' AND direction = 'debit'), 0) AS refunded
         FROM lease_deposit_transactions WHERE lease_id = $1
       )
       UPDATE leases
       SET deposit_collected_amount = totals.collected,
           deposit_deduction_amount = totals.deducted,
           deposit_refunded_amount = totals.refunded,
           updated_by_user_id = $2,
           updated_at = now()
       FROM totals
       WHERE leases.id = $1
       RETURNING leases.deposit_collected_amount, leases.deposit_deduction_amount,
                 leases.deposit_refunded_amount, leases.snapshot_deposit_amount`,
      [leaseId, actorUserId],
    );
    const cache = result.rows[0];
    const ledger = await this.readLedger(client, leaseId, 'FOR UPDATE');
    return {
      required_amount: Number(cache.snapshot_deposit_amount),
      collected_amount: Number(cache.deposit_collected_amount),
      deduction_amount: Number(cache.deposit_deduction_amount),
      refunded_amount: Number(cache.deposit_refunded_amount),
      balance_amount: this.ledgerBalance(ledger),
    };
  }

  private async createVerifiedDepositPayment(
    client: PoolClient,
    propertyId: string,
    residentId: string,
    amount: number,
    payment: DepositPaymentDto,
    actorUserId: string,
  ): Promise<PaymentRow> {
    if (!payment.payment_code?.trim() && !payment.reference_number?.trim()) {
      throw new BadRequestException({
        code: 'DEPOSIT_PAYMENT_REFERENCE_REQUIRED',
        message: 'A verified deposit payment requires a code or reference',
      });
    }
    const paymentCode =
      payment.payment_code?.trim() ||
      `TRF-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const result = await client.query<PaymentRow>(
      `INSERT INTO payments (
         property_id, resident_id, payment_code, payment_method, payment_status, amount,
         paid_at, verified_at, received_by_user_id, verified_by_user_id, reference_number, notes
       ) VALUES ($1, $2, $3, $4, 'verified', $5, COALESCE($6::timestamptz, now()), now(), $7, $7, $8, $9)
       RETURNING id, payment_code`,
      [
        propertyId,
        residentId,
        paymentCode,
        payment.payment_method,
        amount,
        payment.paid_at ?? null,
        actorUserId,
        payment.reference_number?.trim() ?? null,
        payment.notes?.trim() ?? null,
      ],
    );
    return result.rows[0];
  }

  private async issueTargetCycleInvoice(
    client: PoolClient,
    property: PropertyRow,
    lease: LeaseRow,
    resident: ResidentRow,
    occupancyId: string,
    cycleStart: string,
    actorUserId: string,
  ): Promise<{ id: string; invoice_code: string; due_date: string; total_amount: number }> {
    const nextCycleStart = nextBillingStart(
      cycleStart,
      lease.billing_cycle,
      lease.billing_anchor_day,
    );
    const cycleEnd = previousDate(nextCycleStart);
    const rentAmount =
      lease.billing_cycle === 'monthly'
        ? Number(lease.snapshot_monthly_price)
        : Number(lease.snapshot_yearly_price);
    const invoiceCode = `INV-${lease.lease_code}-${cycleStart.replaceAll('-', '')}`;
    const result = await client.query<{
      id: string;
      invoice_code: string;
      due_date: string;
      total_amount: string;
    }>(
      `INSERT INTO invoices (
         property_id, resident_id, room_id, occupancy_id, billing_period_id, lease_id,
         invoice_code, invoice_status, subtotal_amount, late_fee_amount, total_amount,
         due_date, issued_at, snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date,
         snapshot_room_number, snapshot_resident_name, snapshot_monthly_price,
         cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount,
         generation_source, created_by_user_id
       ) VALUES (
         $1, $2, $3, $4, NULL, $5, $6, 'issued', $7, 0, $7, $8::date, now(),
         $9, $10::date, $11::date, $12, $13, $14, $10::date, $11::date, $15, $7, 'auto', $16
       )
       RETURNING id, invoice_code, due_date::text, total_amount`,
      [
        lease.property_id,
        resident.id,
        lease.room_id,
        occupancyId,
        lease.id,
        invoiceCode,
        rentAmount,
        dueDateWithinCycle(cycleStart, cycleEnd, property.default_due_day ?? 25),
        `lease:${lease.lease_code}:${cycleStart}`,
        cycleStart,
        cycleEnd,
        lease.snapshot_room_number,
        resident.full_name,
        lease.snapshot_monthly_price,
        lease.billing_cycle,
        actorUserId,
      ],
    );
    const invoice = result.rows[0];
    await client.query(
      `INSERT INTO invoice_line_items (
         invoice_id, line_type, description, quantity, unit_amount, total_amount, sort_order, metadata
       ) VALUES ($1, 'rent', 'Lease rent', 1, $2, $2, 0, $3::jsonb)`,
      [
        invoice.id,
        rentAmount,
        JSON.stringify({ lease_id: lease.id, billing_cycle: lease.billing_cycle }),
      ],
    );
    return {
      id: invoice.id,
      invoice_code: invoice.invoice_code,
      due_date: invoice.due_date,
      total_amount: Number(invoice.total_amount),
    };
  }

  private async insertOccupancyHistory(
    client: PoolClient,
    occupancyId: string,
    propertyId: string,
    roomId: string,
    residentId: string,
    eventType: 'transfer_out' | 'transfer_in',
    fromStatus: string | null,
    toStatus: string,
    eventDate: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO occupancy_history (
         occupancy_id, property_id, room_id, resident_id, event_type, from_status, to_status,
         event_date, actor_user_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10::jsonb)`,
      [
        occupancyId,
        propertyId,
        roomId,
        residentId,
        eventType,
        fromStatus,
        toStatus,
        eventDate,
        actorUserId,
        JSON.stringify(metadata),
      ],
    );
  }

  private async insertHistory(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    eventType:
      | 'transferred_out'
      | 'transferred_in'
      | 'invoice_generated'
      | 'transfer_scheduled'
      | 'transfer_cancelled'
      | 'transfer_failed',
    actorUserId: string | null,
    eventDate: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_history (property_id, lease_id, event_type, actor_user_id, event_date, metadata)
       VALUES ($1, $2, $3, $4, $5::date, $6::jsonb)`,
      [propertyId, leaseId, eventType, actorUserId, eventDate, JSON.stringify(metadata)],
    );
  }

  private async writeAudit(
    client: PoolClient,
    actorUserId: string,
    propertyId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>,
    context: LeaseAuditContext,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, property_id, action, resource_type, resource_id,
         before_data, after_data, result_status, ip_address, user_agent, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'success', $8::inet, $9, $10)`,
      [
        actorUserId,
        propertyId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(beforeData),
        JSON.stringify(afterData),
        context.ipAddress ?? null,
        context.userAgent ?? null,
        context.correlationId ?? null,
      ],
    );
  }

  private async writeOutbox(
    client: PoolClient,
    input: {
      propertyId: string;
      eventKey: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      actorUserId: string | null;
      correlationId?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.actorUserId,
      ],
    );
  }

  private assertTransferableLease(lease: LeaseRow): void {
    if (lease.lease_status !== 'active') {
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Only an active lease can be transferred',
      });
    }
  }

  private assertTargetRoom(propertyId: string, sourceRoom: RoomRow, targetRoom: RoomRow): void {
    if (sourceRoom.property_id !== propertyId || targetRoom.property_id !== propertyId) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Source and target rooms must belong to the lease property',
      });
    }
    if (sourceRoom.room_status !== 'occupied') {
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Source room is not occupied by the active lease',
      });
    }
    if (targetRoom.room_status !== 'vacant') {
      throw new ConflictException({
        code: 'LEASE_ROOM_CONFLICT',
        message: 'Target room must be vacant',
      });
    }
    if (!targetRoom.kost_type_id) {
      throw new UnprocessableEntityException({
        code: 'ROOM_KOST_TYPE_MISMATCH',
        message: 'Target room has no kost type',
      });
    }
  }

  private assertTargetKostType(propertyId: string, kostType: KostTypeRow): void {
    if (
      kostType.property_id !== propertyId ||
      kostType.status !== 'active' ||
      kostType.deleted_at
    ) {
      throw new UnprocessableEntityException({
        code: 'ROOM_KOST_TYPE_MISMATCH',
        message: 'Target room kost type is not active in this property',
      });
    }
  }

  private assertTopUpAmount(
    topUp: { amount: number; payment: DepositPaymentDto } | undefined,
    requiredTopUp: number,
  ): void {
    if (requiredTopUp === 0 && topUp) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_UNEXPECTED',
        message: 'A deposit top-up is not required for this transfer',
      });
    }
    if (requiredTopUp > 0 && !topUp) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_REQUIRED',
        message: 'Target deposit requires a verified top-up',
      });
    }
    if (topUp && topUp.amount !== requiredTopUp) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_AMOUNT_INVALID',
        message: 'Deposit top-up must exactly cover the target deposit gap',
      });
    }
  }

  private resolveTransferPath(dto: TransferLeasePreviewDto, today: string): TransferPath {
    if (dto.transfer_path) return dto.transfer_path;
    return dto.effective_date === today ? 'same_day_exception' : 'end_period';
  }

  private assertEffectiveDateForPath(
    path: TransferPath,
    value: string,
    today: string,
    source: LeaseRow,
  ): void {
    if (path === 'same_day_exception') {
      this.assertSameDayExceptionDate(value, today);
      return;
    }
    this.assertFutureBoundaryDate(value, today, source);
  }

  private assertSameDayExceptionDate(value: string, today: string): void {
    if (value !== today) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_EFFECTIVE_DATE_MUST_BE_TODAY',
        message:
          'Same-day exception transfers may only be effective on the current Asia/Jakarta business date',
      });
    }
  }

  /** W07B ruling B2: any strictly future billing-cycle boundary is allowed. */
  private assertFutureBoundaryDate(value: string, today: string, source: LeaseRow): void {
    if (value <= today) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_EFFECTIVE_DATE_MUST_BE_FUTURE',
        message:
          'Scheduled transfers must take effect on a strictly future billing-period boundary; use the same-day exception path for today',
      });
    }
    if (!this.futureBillingBoundaries(source, today).includes(value)) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_EFFECTIVE_DATE_NOT_BOUNDARY',
        message:
          'Scheduled transfer effective date must be a future billing-cycle boundary of the source lease',
      });
    }
  }

  private futureBillingBoundaries(source: LeaseRow, today: string): string[] {
    const boundaries: string[] = [];
    let cursor = this.currentOrNextBillingBoundary(source, today);
    for (let index = 0; index < BOUNDARY_SEARCH_HORIZON; index += 1) {
      if (cursor > today) boundaries.push(cursor);
      cursor = nextBillingStart(cursor, source.billing_cycle, source.billing_anchor_day);
    }
    return boundaries;
  }

  /**
   * Legacy and scheduler-disabled properties can retain an already-passed
   * next_billing_date even though their canonical W06 contract invoices are
   * complete. Transfer derives the nearest valid boundary without mutating
   * billing records or weakening invoice/payment authority.
   */
  private currentOrNextBillingBoundary(source: LeaseRow, today: string): string {
    let cursor = source.next_billing_date;
    for (let index = 0; index <= BOUNDARY_SEARCH_HORIZON; index += 1) {
      if (cursor >= today) return cursor;
      cursor = nextBillingStart(cursor, source.billing_cycle, source.billing_anchor_day);
    }
    throw new ConflictException({
      code: 'TRANSFER_BILLING_BOUNDARY_UNAVAILABLE',
      message: 'A current billing-period boundary could not be derived for this lease',
    });
  }

  private assertPropertyScope(user: UserAccessContext, propertyId: string): void {
    if (user.roles.includes('owner') || user.propertyIds.includes(propertyId)) return;
    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  /** W07B ruling B1: transfer top-ups are admin-only (lease.manage + billing.manage). */
  private assertFinancialActor(user: UserAccessContext): void {
    const allowed =
      user.roles.includes('admin') &&
      user.permissions.includes('lease.manage') &&
      user.permissions.includes('billing.manage');
    if (!allowed) {
      throw new ForbiddenException({
        code: 'TRANSFER_FINANCIAL_ACTOR_INVALID',
        message:
          'Only an admin with lease.manage and billing.manage may perform a W07B transfer deposit top-up',
      });
    }
  }

  /** Mirrors W05 activation gender eligibility: building must match, room may be mixed. */
  private assertGenderCompatibility(resident: ResidentRow, targetRoom: RoomRow): void {
    const roomCompatible =
      targetRoom.room_gender_policy === 'mixed' ||
      targetRoom.room_gender_policy === resident.gender;
    const buildingCompatible = targetRoom.building_gender_policy === resident.gender;
    if (!roomCompatible || !buildingCompatible) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_TARGET_ROOM_GENDER_INCOMPATIBLE',
        message: 'Target room or building gender policy is incompatible with the resident',
      });
    }
  }

  private transferCloseReason(input: CutoverInput): string {
    const detail = input.reasonDetail ? ` ${input.reasonDetail}` : '';
    const exception = input.exceptionReason ? ` | exception: ${input.exceptionReason}` : '';
    return `[${input.reasonCode}]${detail}${exception}`.slice(0, 500);
  }

  private transferCommandColumns(): string {
    return `
      id, property_id, resident_id, from_lease_id, from_room_id, to_room_id,
      transfer_path, effective_date::text, reason_code, reason_detail, exception_reason,
      state, failure_code, cancel_reason, commercial_snapshot, transfer_record_id,
      executed_late, created_by_user_id, created_at, executed_at, cancelled_at, failed_at`;
  }

  private safeCommand(command: TransferCommandRow): Record<string, unknown> {
    const snapshot = command.commercial_snapshot ?? {};
    return {
      id: command.id,
      property_id: command.property_id,
      resident_id: command.resident_id,
      from_lease_id: command.from_lease_id,
      from_room_id: command.from_room_id,
      to_room_id: command.to_room_id,
      transfer_path: command.transfer_path,
      effective_date: command.effective_date,
      reason_code: command.reason_code,
      reason_detail: command.reason_detail,
      exception_reason: command.exception_reason,
      state: command.state,
      failure_code: command.failure_code,
      cancel_reason: command.cancel_reason,
      transfer_record_id: command.transfer_record_id,
      executed_late: command.executed_late,
      source_end_date: 'source_end_date' in snapshot ? (snapshot.source_end_date ?? null) : null,
      created_by_user_id: command.created_by_user_id,
      created_at: command.created_at,
      executed_at: command.executed_at,
      cancelled_at: command.cancelled_at,
      failed_at: command.failed_at,
    };
  }

  private async lockTransferCommand(
    client: PoolClient,
    commandId: string,
  ): Promise<TransferCommandRow> {
    const result = await client.query<TransferCommandRow>(
      `SELECT ${this.transferCommandColumns()}
       FROM lease_transfer_commands
       WHERE id = $1
       FOR UPDATE`,
      [commandId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'TRANSFER_COMMAND_NOT_FOUND',
        message: 'Transfer command not found',
      });
    }
    return result.rows[0];
  }

  private async buildSchedulerActor(
    client: PoolClient,
    userId: string | null,
    propertyId: string,
  ): Promise<UserAccessContext> {
    if (!userId) {
      throw new ConflictException({
        code: 'TRANSFER_COMMAND_ACTOR_INVALID',
        message: 'Scheduled transfer command has no creating user',
      });
    }
    const result = await client.query<{
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string;
      user_status: string;
    }>(`SELECT id, email, phone, display_name, user_status FROM users WHERE id = $1`, [userId]);
    const row = result.rows[0];
    if (!row || row.user_status !== 'active') {
      throw new ConflictException({
        code: 'TRANSFER_COMMAND_ACTOR_INVALID',
        message: 'Scheduled transfer command creator is no longer an active user',
      });
    }
    return {
      id: row.id,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      roles: ['admin'],
      permissions: ['lease.manage', 'billing.manage'],
      propertyIds: [propertyId],
      sessionId: 'system:w07b-transfer-scheduler',
    };
  }

  private extractFailureCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const code =
        typeof response === 'object' && response !== null
          ? (response as { code?: unknown }).code
          : undefined;
      if (typeof code === 'string' && code.length > 0) return code;
    }
    return 'TRANSFER_EXECUTION_FAILED';
  }

  /** Marks a scheduled command failed (terminal). Runs in its own transaction. */
  private async markCommandFailed(
    commandId: string,
    failureCode: string,
    error: unknown,
    runId: string,
    lateExecution: boolean,
  ): Promise<void> {
    const failureDetail = {
      message: error instanceof Error ? error.message : String(error),
      run_id: runId,
      late_execution: lateExecution,
    };
    try {
      await this.leases.transaction(async (client) => {
        const updated = await client.query<TransferCommandRow>(
          `UPDATE lease_transfer_commands
           SET state = 'failed', failure_code = $2, failure_detail = $3::jsonb, failed_at = now()
           WHERE id = $1 AND state = 'scheduled'
           RETURNING ${this.transferCommandColumns()}`,
          [commandId, failureCode, JSON.stringify(failureDetail)],
        );
        const command = updated.rows[0];
        if (!command) return;
        const today = await this.jakartaToday(client);
        await this.insertHistory(
          client,
          command.property_id,
          command.from_lease_id,
          'transfer_failed',
          command.created_by_user_id,
          today,
          {
            transfer_command_id: command.id,
            failure_code: failureCode,
            late_execution: lateExecution,
          },
        );
        await this.writeAudit(
          client,
          command.created_by_user_id as string,
          command.property_id,
          'lease.transfer.failed',
          'lease_transfer_command',
          command.id,
          { state: 'scheduled' },
          { state: 'failed', failure_code: failureCode, failure_detail: failureDetail },
          { correlationId: runId },
        );
        await this.writeOutbox(client, {
          propertyId: command.property_id,
          eventKey: `lease.transfer_failed:${command.id}`,
          eventType: 'lease.transfer_failed',
          aggregateType: 'lease_transfer_command',
          aggregateId: command.id,
          actorUserId: command.created_by_user_id,
          correlationId: runId,
          payload: {
            transfer_command_id: command.id,
            source_lease_id: command.from_lease_id,
            target_room_id: command.to_room_id,
            effective_date: command.effective_date,
            failure_code: failureCode,
            late_execution: lateExecution,
          },
        });
      });
    } catch {
      // The command stays scheduled if failure bookkeeping itself fails; the
      // scheduler will pick it up again on the next run.
    }
  }

  private ledgerBalance(ledger: LedgerRow[]): number {
    return ledger.reduce(
      (total, entry) =>
        total + (entry.direction === 'credit' ? Number(entry.amount) : -Number(entry.amount)),
      0,
    );
  }

  private safeLease(lease: LeaseRow, roomNumber: string, kostTypeName: string) {
    return {
      id: lease.id,
      property_id: lease.property_id,
      lease_code: lease.lease_code,
      lease_status: lease.lease_status,
      start_date: lease.start_date,
      end_date: lease.end_date,
      billing_cycle: lease.billing_cycle,
      billing_anchor_day: lease.billing_anchor_day,
      next_billing_date: lease.next_billing_date,
      room: { id: lease.room_id, number: roomNumber },
      kost_type: { id: lease.kost_type_id, name: kostTypeName },
      snapshot: {
        monthly_price: Number(lease.snapshot_monthly_price),
        yearly_price: Number(lease.snapshot_yearly_price),
        deposit_amount: Number(lease.snapshot_deposit_amount),
      },
    };
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.canonicalJson(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private newLeaseCode(today: string): string {
    return `LS-${today.replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
  }

  private async jakartaToday(client: PoolClient): Promise<string> {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  private leaseColumns(): string {
    return `id, property_id, lease_code, resident_id, room_id, occupancy_id, kost_type_id,
            lease_status, start_date::text, end_date::text, billing_cycle, billing_anchor_day,
            next_billing_date::text, snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount,
            snapshot_room_number, snapshot_kost_type_name, notes,
            deposit_collected_amount, deposit_deduction_amount, deposit_refunded_amount`;
  }

  private rethrowKnownDatabaseConflict(error: unknown): never {
    if (error instanceof Error && 'code' in error) {
      const databaseError = error as Error & { code?: string; constraint?: string };
      if (databaseError.code === '23505') {
        if (
          databaseError.constraint?.includes('resident') ||
          databaseError.constraint?.includes('occupancies_one_active_resident')
        ) {
          throw new ConflictException({
            code: 'LEASE_RESIDENT_CONFLICT',
            message: 'Resident already has an active lease or occupancy',
          });
        }
        if (
          databaseError.constraint?.includes('room') ||
          databaseError.constraint?.includes('occupancies_one_active_room')
        ) {
          throw new ConflictException({
            code: 'LEASE_ROOM_CONFLICT',
            message: 'Room already has an active lease or occupancy',
          });
        }
      }
    }
    throw error;
  }
}
