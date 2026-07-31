import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { UserAccessContext } from '../iam/types/iam.types';
import { DepositPaymentDto, TransferLeaseDto, TransferLeasePreviewDto } from './lease.dto';
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
};

type ResidentRow = {
  id: string;
  property_id: string;
  full_name: string;
  resident_status: string;
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
      this.assertEffectiveDate(dto.effective_date, today);
      const property = await this.lockProperty(client, scope.property_id);
      await this.features.assertTransferEnabled(scope.property_id, client);
      const source = await this.lockLease(client, leaseId, 'FOR SHARE');
      this.assertTransferableLease(source, today);
      if (source.room_id === dto.target_room_id) {
        throw new UnprocessableEntityException({
          code: 'TRANSFER_TARGET_ROOM_INVALID',
          message: 'Transfer target must differ from the source room',
        });
      }

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
        source.next_billing_date === today && !currentCycleInvoiceExists;

      return {
        data: {
          effective_date: today,
          source_lease: this.safeLease(source, sourceRoom.number, source.snapshot_kost_type_name),
          target_room: {
            id: targetRoom.id,
            number: targetRoom.number,
            kost_type: { id: targetKostType.id, name: targetKostType.name },
          },
          deposit: {
            carried_amount: carriedDeposit,
            target_required_amount: targetRequiredDeposit,
            top_up_required_amount: topUpRequired,
          },
          billing: {
            billing_cycle: source.billing_cycle,
            billing_anchor_day: source.billing_anchor_day,
            source_next_billing_date: source.next_billing_date,
            target_invoice_will_be_issued: targetInvoiceWillBeIssued,
            target_next_billing_date: targetInvoiceWillBeIssued
              ? nextBillingStart(today, source.billing_cycle, source.billing_anchor_day)
              : source.next_billing_date,
            due_day: property.default_due_day ?? 25,
          },
          old_outstanding_amount: await this.outstandingAmount(
            client,
            invoices.map((invoice) => invoice.id),
          ),
        },
      };
    });
  }

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
        this.assertEffectiveDate(dto.effective_date, today);

        // Keep M6 lifecycle lock order stable: property, source lease, sorted
        // room ids, resident, occupancy, invoices, then ledger. The target
        // kost type is a shared master read after its room is locked.
        const property = await this.lockProperty(client, scope.property_id);
        await this.features.assertTransferEnabled(scope.property_id, client);
        const source = await this.lockLease(client, leaseId, 'FOR UPDATE');
        this.assertTransferableLease(source, today);
        if (source.room_id === dto.target_room_id) {
          throw new UnprocessableEntityException({
            code: 'TRANSFER_TARGET_ROOM_INVALID',
            message: 'Transfer target must differ from the source room',
          });
        }

        const rooms = await this.lockRooms(
          client,
          [source.room_id, dto.target_room_id],
          'FOR UPDATE',
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
        const occupancy = await this.lockOccupancy(client, source.occupancy_id);
        if (
          occupancy.property_id !== scope.property_id ||
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
        this.assertTopUp(dto, requiredTopUp);
        if (dto.top_up) this.assertFinancialActor(user);

        const sourceCurrentCycleInvoiceExists = invoices.some(
          (invoice) => invoice.cycle_start_date === today,
        );
        const issueTargetInvoice =
          source.next_billing_date === today && !sourceCurrentCycleInvoiceExists;
        const targetNextBillingDate =
          source.next_billing_date === today
            ? nextBillingStart(today, source.billing_cycle, source.billing_anchor_day)
            : source.next_billing_date;
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
          [source.occupancy_id, today, user.id],
        );
        const transferredSourceResult = await client.query<LeaseRow>(
          `UPDATE leases
           SET lease_status = 'transferred', end_date = $2::date, closed_at = now(),
               closed_by_user_id = $3, close_reason = $4, updated_by_user_id = $3, updated_at = now()
           WHERE id = $1
           RETURNING ${this.leaseColumns()}`,
          [source.id, today, user.id, dto.reason.trim()],
        );
        const transferredSource = transferredSourceResult.rows[0];

        const targetOccupancyResult = await client.query<{ id: string }>(
          `INSERT INTO occupancies (
             property_id, room_id, resident_id, start_date, occupancy_status, created_by_user_id
           ) VALUES ($1, $2, $3, $4::date, 'active', $5)
           RETURNING id`,
          [scope.property_id, targetRoom.id, resident.id, today, user.id],
        );
        const targetOccupancyId = targetOccupancyResult.rows[0].id;
        const targetLeaseCode = this.newLeaseCode(today);
        const targetLeaseResult = await client.query<LeaseRow>(
          `INSERT INTO leases (
             property_id, lease_code, resident_id, room_id, occupancy_id, kost_type_id,
             lease_status, start_date, billing_cycle, billing_anchor_day, next_billing_date,
             snapshot_monthly_price, snapshot_yearly_price, snapshot_deposit_amount,
             snapshot_room_number, snapshot_kost_type_name, notes, transferred_from_lease_id,
             created_by_user_id, updated_by_user_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, 'active', $7::date, $8, $9, $10::date,
             $11, $12, $13, $14, $15, $16, $17, $18, $18
           )
           RETURNING ${this.leaseColumns()}`,
          [
            scope.property_id,
            targetLeaseCode,
            resident.id,
            targetRoom.id,
            targetOccupancyId,
            targetKostType.id,
            today,
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
            user.id,
          ],
        );
        const targetLease = targetLeaseResult.rows[0];

        const transferRecordResult = await client.query<TransferRecordRow>(
          `INSERT INTO room_transfer_records (
             property_id, resident_id, from_lease_id, to_lease_id, from_room_id, to_room_id,
             effective_date, reason, carried_deposit_amount, required_target_deposit_amount,
             top_up_amount, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12)
           RETURNING id, effective_date::text, carried_deposit_amount, required_target_deposit_amount,
                     top_up_amount`,
          [
            scope.property_id,
            resident.id,
            source.id,
            targetLease.id,
            sourceRoom.id,
            targetRoom.id,
            today,
            dto.reason.trim(),
            carriedDeposit,
            requiredTargetDeposit,
            requiredTopUp,
            user.id,
          ],
        );
        const transferRecord = transferRecordResult.rows[0];

        await this.insertLedger(client, {
          propertyId: scope.property_id,
          leaseId: source.id,
          transactionType: 'carry_forward',
          direction: 'debit',
          amount: carriedDeposit,
          transferRecordId: transferRecord.id,
          reasonType: 'transfer',
          reason: 'Lease transfer carry-forward',
          metadata: { counterpart_lease_id: targetLease.id },
          actorUserId: user.id,
        });
        await this.insertLedger(client, {
          propertyId: scope.property_id,
          leaseId: targetLease.id,
          transactionType: 'carry_forward',
          direction: 'credit',
          amount: carriedDeposit,
          transferRecordId: transferRecord.id,
          reasonType: 'transfer',
          reason: 'Lease transfer carry-forward',
          metadata: { counterpart_lease_id: source.id },
          actorUserId: user.id,
        });

        let topUpPayment: PaymentRow | null = null;
        if (dto.top_up) {
          topUpPayment = await this.createVerifiedDepositPayment(
            client,
            scope.property_id,
            resident.id,
            dto.top_up.amount,
            dto.top_up.payment,
            user.id,
          );
          await client.query(
            `INSERT INTO payment_allocations (payment_id, target_type, target_id, allocated_amount)
             VALUES ($1, 'deposit', $2, $3)`,
            [topUpPayment.id, targetLease.id, dto.top_up.amount],
          );
          await this.insertLedger(client, {
            propertyId: scope.property_id,
            leaseId: targetLease.id,
            transactionType: 'top_up',
            direction: 'credit',
            amount: dto.top_up.amount,
            paymentId: topUpPayment.id,
            reasonType: 'verified_payment',
            metadata: {
              payment_code: topUpPayment.payment_code,
              transfer_record_id: transferRecord.id,
            },
            actorUserId: user.id,
          });
        }

        await this.refreshDepositCache(client, source.id, user.id);
        const targetDeposit = await this.refreshDepositCache(client, targetLease.id, user.id);

        await client.query(
          `UPDATE rooms
           SET room_status = CASE WHEN id = $1 THEN 'vacant' ELSE 'occupied' END,
               updated_by_user_id = $3, updated_at = now()
           WHERE id = ANY($2::uuid[])`,
          [sourceRoom.id, [sourceRoom.id, targetRoom.id], user.id],
        );
        await this.insertOccupancyHistory(
          client,
          source.occupancy_id,
          scope.property_id,
          sourceRoom.id,
          resident.id,
          'transfer_out',
          'active',
          'transferred',
          today,
          user.id,
          { transfer_record_id: transferRecord.id },
        );
        await this.insertOccupancyHistory(
          client,
          targetOccupancyId,
          scope.property_id,
          targetRoom.id,
          resident.id,
          'transfer_in',
          null,
          'active',
          today,
          user.id,
          { transfer_record_id: transferRecord.id },
        );
        await this.insertHistory(
          client,
          scope.property_id,
          source.id,
          'transferred_out',
          user.id,
          today,
          {
            transfer_record_id: transferRecord.id,
            to_lease_id: targetLease.id,
            to_room_id: targetRoom.id,
            carried_deposit_amount: carriedDeposit,
          },
        );
        await this.insertHistory(
          client,
          scope.property_id,
          targetLease.id,
          'transferred_in',
          user.id,
          today,
          {
            transfer_record_id: transferRecord.id,
            from_lease_id: source.id,
            from_room_id: sourceRoom.id,
            carried_deposit_amount: carriedDeposit,
            top_up_amount: requiredTopUp,
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
            user.id,
          );
          await this.insertHistory(
            client,
            scope.property_id,
            targetLease.id,
            'invoice_generated',
            user.id,
            today,
            { invoice_id: targetInvoice.id, amount: targetInvoice.total_amount },
          );
          await this.writeOutbox(client, {
            propertyId: scope.property_id,
            eventKey: `billing.invoice_issued:${targetInvoice.id}`,
            eventType: 'billing.invoice_issued',
            aggregateType: 'invoice',
            aggregateId: targetInvoice.id,
            actorUserId: user.id,
            correlationId: context.correlationId,
            payload: {
              invoice_id: targetInvoice.id,
              lease_id: targetLease.id,
              amount: targetInvoice.total_amount,
            },
          });
        }

        await this.writeAudit(
          client,
          user.id,
          scope.property_id,
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
            reason_present: true,
          },
          context,
        );
        await this.writeOutbox(client, {
          propertyId: scope.property_id,
          eventKey: `lease.transferred:${transferRecord.id}`,
          eventType: 'lease.transferred',
          aggregateType: 'room_transfer',
          aggregateId: transferRecord.id,
          actorUserId: user.id,
          correlationId: context.correlationId,
          payload: {
            transfer_record_id: transferRecord.id,
            source_lease_id: source.id,
            target_lease_id: targetLease.id,
            source_room_id: sourceRoom.id,
            target_room_id: targetRoom.id,
            carried_deposit_amount: carriedDeposit,
            top_up_amount: requiredTopUp,
          },
        });

        return {
          resourceType: 'room_transfer',
          resourceId: transferRecord.id,
          data: {
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
            old_outstanding_amount: outstandingAmount,
          },
        };
      },
    );
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
      `SELECT id, property_id, number, room_status, kost_type_id
       FROM rooms
       WHERE id = ANY($1::uuid[])
       ORDER BY id
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
      `SELECT id, property_id, full_name, resident_status FROM residents WHERE id = $1 FOR UPDATE`,
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
    eventType: 'transferred_out' | 'transferred_in' | 'invoice_generated',
    actorUserId: string,
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

  private assertTransferableLease(lease: LeaseRow, today: string): void {
    if (lease.lease_status !== 'active') {
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Only an active lease can be transferred',
      });
    }
    if (lease.next_billing_date < today) {
      throw new ConflictException({
        code: 'LEASE_BILLING_NOT_CURRENT',
        message: 'Bring lease billing up to date before transferring it',
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

  private assertTopUp(dto: TransferLeaseDto, requiredTopUp: number): void {
    if (requiredTopUp === 0 && dto.top_up) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_UNEXPECTED',
        message: 'A deposit top-up is not required for this transfer',
      });
    }
    if (requiredTopUp > 0 && !dto.top_up) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_REQUIRED',
        message: 'Target deposit requires a verified top-up',
      });
    }
    if (dto.top_up && dto.top_up.amount !== requiredTopUp) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_DEPOSIT_TOP_UP_AMOUNT_INVALID',
        message: 'Deposit top-up must exactly cover the target deposit gap',
      });
    }
  }

  private assertEffectiveDate(value: string, today: string): void {
    if (value !== today) {
      throw new UnprocessableEntityException({
        code: 'TRANSFER_EFFECTIVE_DATE_MUST_BE_TODAY',
        message: 'V1 transfers may only be effective on the current Asia/Jakarta business date',
      });
    }
  }

  private assertPropertyScope(user: UserAccessContext, propertyId: string): void {
    if (user.roles.includes('owner') || user.propertyIds.includes(propertyId)) return;
    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  private assertFinancialActor(user: UserAccessContext): void {
    if (
      !user.roles.some((role) => role === 'owner' || role === 'manager') ||
      !user.permissions.includes('billing.manage')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Only an owner or manager with billing.manage may perform a financial transfer top-up',
      });
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
