import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { UserAccessContext } from '../iam/types/iam.types';
import {
  CancelLeaseCheckoutDto,
  CompleteLeaseCheckoutDto,
  CreateLeaseCheckoutNoticeDto,
  RecordLeaseCheckoutHandoverDto,
  RecordLeaseCheckoutInspectionDto,
  SettleRefundDto,
  WaiveRefundDto,
} from './lease.dto';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type { IdempotentResult, LeaseAuditContext } from './lease.types';

type CheckoutRow = {
  id: string;
  property_id: string;
  lease_id: string;
  occupancy_id: string;
  resident_id: string;
  room_id: string;
  state: string;
  effective_date: string;
  notice_recorded_date: string;
  notice_reason: string;
  notice_exception_reason: string | null;
};
type LeaseRow = {
  id: string;
  property_id: string;
  occupancy_id: string;
  resident_id: string;
  room_id: string;
  lease_status: string;
};
type InvoiceRow = {
  id: string;
  total_amount: string;
  credit_amount: string;
  net_allocated: string;
};
type LedgerRow = { direction: 'credit' | 'debit'; amount: string };
type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_status: number | null;
  response_body: unknown;
};

/** W07D sole general-checkout authority. W07A termination remains separate. */
@Injectable()
export class LeaseCheckoutService {
  constructor(
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly w06Billing: W06BillingService,
  ) {}

  async list(user: UserAccessContext, leaseId: string) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    const result = await this.leases.query<CheckoutRow>(
      `SELECT id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason
       FROM lease_checkout_commands WHERE lease_id=$1 ORDER BY created_at DESC`,
      [leaseId],
    );
    return { data: { commands: result.rows } };
  }

  async notice(
    user: UserAccessContext,
    leaseId: string,
    dto: CreateLeaseCheckoutNoticeDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ): Promise<IdempotentResult<Record<string, unknown>>> {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout`,
      key,
      dto,
      context,
      201,
      async (client, today) => {
        const lease = await this.lockLease(client, leaseId);
        this.assertActive(lease);
        if (dto.effective_date < today)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_EFFECTIVE_DATE_PAST',
            message: 'Checkout effective date cannot be in the past',
          });
        const exceptionReason = dto.notice_exception_reason?.trim() || null;
        const minimumNotice = await client.query<{ minimum_date: string }>(
          `SELECT ($1::date + 14)::text AS minimum_date`,
          [today],
        );
        if (dto.effective_date < minimumNotice.rows[0].minimum_date && !exceptionReason)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_NOTICE_REQUIRED',
            message: 'Checkout requires 14 days notice or an authorized exception',
          });
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM lease_checkout_commands WHERE lease_id=$1 AND state IN ('notice_received','scheduled','inspection_required','settlement_pending') FOR UPDATE`,
          [lease.id],
        );
        if (existing.rows[0])
          throw new ConflictException({
            code: 'CHECKOUT_ALREADY_OPEN',
            message: 'Lease already has a non-terminal checkout command',
          });
        const inserted = await client.query<CheckoutRow>(
          `INSERT INTO lease_checkout_commands(property_id,lease_id,occupancy_id,resident_id,room_id,effective_date,notice_recorded_date,notice_reason,notice_exception_reason,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10)
         ON CONFLICT DO NOTHING
          RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [
            scope.property_id,
            lease.id,
            lease.occupancy_id,
            lease.resident_id,
            lease.room_id,
            dto.effective_date,
            today,
            dto.reason.trim(),
            exceptionReason,
            user.id,
          ],
        );
        const checkout = inserted.rows[0];
        if (!checkout)
          throw new ConflictException({
            code: 'CHECKOUT_ALREADY_OPEN',
            message: 'Lease already has a non-terminal checkout command',
          });
        await this.history(
          client,
          scope.property_id,
          lease.id,
          'checkout_notice_received',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            reason: dto.reason.trim(),
            notice_exception: Boolean(exceptionReason),
          },
        );
        await this.audit(
          client,
          user.id,
          scope.property_id,
          'lease.checkout.notice',
          'lease_checkout_command',
          checkout.id,
          undefined,
          { state: checkout.state, effective_date: dto.effective_date },
          context,
        );
        await this.outbox(
          client,
          scope.property_id,
          `lease.checkout_notice:${checkout.id}`,
          'lease.checkout.notice_recorded',
          'lease_checkout_command',
          checkout.id,
          user.id,
          context,
          {
            checkout_command_id: checkout.id,
            lease_id: lease.id,
            effective_date: dto.effective_date,
          },
        );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: checkout.id,
          data: { checkout },
        };
      },
    );
  }

  async schedule(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'schedule',
      key,
      {},
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'notice_received');
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='scheduled',scheduled_by_user_id=$2,scheduled_at=now(),updated_at=now() WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [checkout.id, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_scheduled',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  async handover(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: RecordLeaseCheckoutHandoverDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'handover',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'scheduled');
        this.assertHandoverConfirmations(dto);
        await this.insertEvidence(
          client,
          checkout,
          'keys_access',
          dto.key_access_file_ids,
          user.id,
          { confirmed: true, notes_present: Boolean(dto.notes) },
        );
        await this.insertEvidence(client, checkout, 'inventory', dto.inventory_file_ids, user.id, {
          confirmed: true,
          notes_present: Boolean(dto.notes),
        });
        await this.insertEvidence(client, checkout, 'parking', dto.parking_file_ids, user.id, {
          confirmed: true,
          notes_present: Boolean(dto.notes),
        });
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='inspection_required',handover_recorded_by_user_id=$2,handover_recorded_at=now(),updated_at=now() WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [checkout.id, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_handover_recorded',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  async inspection(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: RecordLeaseCheckoutInspectionDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'inspection',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        this.requireState(checkout, 'inspection_required');
        await this.insertEvidence(
          client,
          checkout,
          'inspection',
          dto.inspection_file_ids,
          user.id,
          { notes_present: Boolean(dto.notes) },
        );
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='settlement_pending',inspection_room_status=$2,inspection_recorded_by_user_id=$3,inspection_recorded_at=now(),updated_at=now() WHERE id=$1
         RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [checkout.id, dto.room_status_after, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_inspection_recorded',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  async complete(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CompleteLeaseCheckoutDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout/${commandId}/complete`,
      key,
      dto,
      context,
      200,
      async (client, today) => {
        await this.lockProperty(client, scope.property_id);
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        this.requireState(checkout, 'settlement_pending');
        if (today < checkout.effective_date)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_EFFECTIVE_DATE_NOT_REACHED',
            message: 'Checkout cannot complete before its effective date',
          });
        const inspectionResult = await client.query<{ inspection_room_status: string }>(
          `SELECT inspection_room_status FROM lease_checkout_commands WHERE id=$1 FOR UPDATE`,
          [checkout.id],
        );
        if (inspectionResult.rows[0]?.inspection_room_status !== dto.room_status_after)
          throw new ConflictException({
            code: 'CHECKOUT_INSPECTION_RESULT_CONFLICT',
            message: 'Completion room result must match the recorded inspection result',
          });
        const lease = await this.lockLease(client, leaseId);
        this.assertActive(lease);
        if (
          lease.occupancy_id !== checkout.occupancy_id ||
          lease.room_id !== checkout.room_id ||
          lease.resident_id !== checkout.resident_id
        )
          throw new ConflictException({
            code: 'CHECKOUT_LIFECYCLE_CONFLICT',
            message: 'Checkout no longer matches the active lease',
          });
        await this.lockOccupancyAndRoom(client, checkout);
        await this.assertEvidenceComplete(client, checkout);
        const invoices = await this.lockInvoices(client, lease.id);
        const balance = await this.lockDepositBalance(client, lease.id);
        await this.lockResidentParking(client, checkout.property_id, checkout.resident_id);
        const invoiceCredits = await this.applyInvoiceCredits(
          client,
          checkout,
          invoices,
          balance,
          user.id,
        );
        const credited = invoiceCredits.reduce((sum, row) => sum + row.amount, 0);
        const damage = dto.damage_deductions ?? [];
        const damageTotal = damage.reduce((sum, row) => sum + row.amount, 0);
        if (damageTotal > balance - credited)
          throw new UnprocessableEntityException({
            code: 'CHECKOUT_DEPOSIT_EXCEEDED',
            message: 'Damage deductions exceed remaining deposit balance',
          });
        for (const deduction of damage) {
          await this.assertFiles(client, checkout.property_id, [deduction.evidence_file_id]);
          const entry = await client.query<{ id: string }>(
            `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id)
           VALUES($1,$2,'deduction','debit',$3,'checkout_damage',$4,$5,'settled',now(),$6,$7::jsonb,$6) RETURNING id`,
            [
              checkout.property_id,
              lease.id,
              deduction.amount,
              deduction.reason.trim(),
              deduction.evidence_file_id,
              user.id,
              JSON.stringify({ checkout_command_id: checkout.id }),
            ],
          );
          await this.insertEvidence(
            client,
            checkout,
            'damage',
            [deduction.evidence_file_id],
            user.id,
            { deposit_transaction_id: entry.rows[0].id, amount: deduction.amount },
          );
        }
        const refundAmount = balance - credited - damageTotal;
        let refundId: string | null = null;
        let refundDueDate: string | null = null;
        if (refundAmount > 0) {
          const due = await client.query<{ due_date: string }>(
            `SELECT max(day)::date::text AS due_date FROM (
             SELECT day FROM generate_series(($1::date + 1),($1::date + 14),'1 day'::interval) day
             WHERE extract(isodow FROM day) < 6 ORDER BY day LIMIT 7
           ) weekdays`,
            [today],
          );
          refundDueDate = due.rows[0]?.due_date ?? null;
          const refund = await client.query<{ id: string }>(
            `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,reason_type,reason,settlement_status,refund_due_date,metadata,created_by_user_id)
           VALUES($1,$2,'refund','debit',$3,'checkout_refund',$4,'pending',$5::date,$6::jsonb,$7) RETURNING id`,
            [
              checkout.property_id,
              lease.id,
              refundAmount,
              dto.refund_reason?.trim() || 'Checkout security-deposit refund',
              refundDueDate,
              JSON.stringify({ checkout_command_id: checkout.id }),
              user.id,
            ],
          );
          refundId = refund.rows[0].id;
          await this.insertEvidence(client, checkout, 'refund', [], user.id, {
            deposit_transaction_id: refundId,
            amount: refundAmount,
            refund_due_date: refundDueDate,
          });
        }
        await client.query(
          `WITH released AS (
             SELECT slot.id, slot.vehicle_id, zone.property_id
             FROM parking_slots slot
             JOIN parking_zones zone ON zone.id = slot.zone_id
             JOIN vehicles vehicle ON vehicle.id = slot.vehicle_id
             WHERE zone.property_id = $1
               AND vehicle.property_id = $1
               AND vehicle.resident_id = $2
               AND slot.slot_status = 'occupied'
             FOR UPDATE OF slot, vehicle
           )
           INSERT INTO parking_assignment_histories
             (property_id, slot_id, vehicle_id, action, reason, actor_user_id, metadata)
           SELECT property_id, id, vehicle_id, 'released', 'General checkout', $3,
                  jsonb_build_object('source', 'lease_checkout', 'checkout_command_id', $4::uuid)
           FROM released`,
          [checkout.property_id, checkout.resident_id, user.id, checkout.id],
        );
        await client.query(
          `UPDATE parking_slots slot SET slot_status='available',vehicle_id=NULL,updated_at=now()
           FROM parking_zones zone JOIN vehicles vehicle ON vehicle.id=slot.vehicle_id
           WHERE slot.zone_id=zone.id AND zone.property_id=$1 AND vehicle.property_id=$1
             AND vehicle.resident_id=$2 AND slot.slot_status='occupied'`,
          [checkout.property_id, checkout.resident_id],
        );
        const endedOccupancy = await client.query(
          `UPDATE occupancies SET occupancy_status='ended',end_date=$2::date,closed_by_user_id=$3,updated_at=now() WHERE id=$1 AND occupancy_status='active'`,
          [checkout.occupancy_id, today, user.id],
        );
        if (endedOccupancy.rowCount !== 1)
          throw new ConflictException({
            code: 'CHECKOUT_OCCUPANCY_CONFLICT',
            message: 'Active occupancy cannot be closed',
          });
        await client.query(
          `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata) VALUES($1,$2,$3,$4,'check_out','active','ended',$5::date,$6,$7::jsonb)`,
          [
            checkout.occupancy_id,
            checkout.property_id,
            checkout.room_id,
            checkout.resident_id,
            today,
            user.id,
            JSON.stringify({ source: 'lease_checkout', checkout_command_id: checkout.id }),
          ],
        );
        const endedLease = await client.query(
          `UPDATE leases SET lease_status='ended',end_date=$2::date,closed_at=now(),closed_by_user_id=$3,close_reason='checkout',updated_by_user_id=$3,updated_at=now() WHERE id=$1 AND lease_status='active'`,
          [lease.id, today, user.id],
        );
        if (endedLease.rowCount !== 1)
          throw new ConflictException({
            code: 'CHECKOUT_LEASE_CONFLICT',
            message: 'Active lease cannot be closed',
          });
        const roomUpdated = await client.query(
          `UPDATE rooms SET room_status=$2,updated_by_user_id=$3,updated_at=now() WHERE id=$1 AND property_id=$4`,
          [checkout.room_id, dto.room_status_after, user.id, checkout.property_id],
        );
        if (roomUpdated.rowCount !== 1)
          throw new ConflictException({
            code: 'CHECKOUT_ROOM_CONFLICT',
            message: 'Room result could not be recorded',
          });
        const completed = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='completed',completion_room_status=$2,completed_by_user_id=$3,completed_at=now(),updated_at=now() WHERE id=$1 RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [checkout.id, dto.room_status_after, user.id],
        );
        await this.history(
          client,
          checkout.property_id,
          lease.id,
          'checkout_completed',
          user.id,
          today,
          {
            checkout_command_id: checkout.id,
            invoice_credit_amount: credited,
            damage_deduction_amount: damageTotal,
            refund_amount: refundAmount,
            refund_due_date: refundDueDate,
            room_status_after: dto.room_status_after,
          },
        );
        await this.audit(
          client,
          user.id,
          checkout.property_id,
          'lease.checkout.complete',
          'lease_checkout_command',
          checkout.id,
          { state: 'settlement_pending' },
          { state: 'completed', refund_due_date: refundDueDate },
          context,
        );
        await this.outbox(
          client,
          checkout.property_id,
          `lease.checkout_completed:${checkout.id}`,
          'lease.checkout.completed',
          'lease_checkout_command',
          checkout.id,
          user.id,
          context,
          {
            checkout_command_id: checkout.id,
            lease_id: lease.id,
            room_id: checkout.room_id,
            refund_transaction_id: refundId,
            refund_due_date: refundDueDate,
          },
        );
        await this.outbox(
          client,
          checkout.property_id,
          `lease.checkout_access_reconcile:${checkout.id}`,
          'lease.checkout.access_reconciliation_requested',
          'lease_checkout_command',
          checkout.id,
          user.id,
          context,
          {
            checkout_command_id: checkout.id,
            resident_id: checkout.resident_id,
            room_id: checkout.room_id,
          },
        );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: checkout.id,
          data: {
            checkout: completed.rows[0],
            refund_due_date: refundDueDate,
            refund_transaction_id: refundId,
            invoice_credit_amount: credited,
          },
        };
      },
    );
  }

  async settleRefund(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    refundId: string,
    dto: SettleRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.settleCheckoutRefund(
      user,
      scope.property_id,
      leaseId,
      commandId,
      refundId,
      'settled',
      dto,
      key,
      context,
    );
  }

  async waiveRefund(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    refundId: string,
    dto: WaiveRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id, true);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.settleCheckoutRefund(
      user,
      scope.property_id,
      leaseId,
      commandId,
      refundId,
      'waived',
      dto,
      key,
      context,
    );
  }

  async cancel(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    dto: CancelLeaseCheckoutDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.transition(
      user,
      leaseId,
      commandId,
      'cancel',
      key,
      dto,
      context,
      async (client, checkout, today) => {
        if (!['notice_received', 'scheduled'].includes(checkout.state))
          throw new ConflictException({
            code: 'CHECKOUT_CANCELLATION_FORBIDDEN',
            message: 'Checkout can only be cancelled before handover',
          });
        const updated = await client.query<CheckoutRow>(
          `UPDATE lease_checkout_commands SET state='cancelled',cancelled_by_user_id=$2,cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE id=$1 RETURNING id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason`,
          [checkout.id, user.id, dto.reason.trim()],
        );
        await this.history(
          client,
          checkout.property_id,
          checkout.lease_id,
          'checkout_cancelled',
          user.id,
          today,
          { checkout_command_id: checkout.id },
        );
        return updated.rows[0];
      },
    );
  }

  private async transition(
    user: UserAccessContext,
    leaseId: string,
    commandId: string,
    action: string,
    key: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    mutate: (client: PoolClient, checkout: CheckoutRow, today: string) => Promise<CheckoutRow>,
  ) {
    const scope = await this.lookupScope(leaseId);
    this.assertAdmin(user, scope.property_id);
    await this.features.assertCheckoutEnabled(scope.property_id);
    return this.command(
      user,
      scope.property_id,
      `POST /leases/${leaseId}/checkout/${commandId}/${action}`,
      key,
      payload,
      context,
      200,
      async (client, today) => {
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        const updated = await mutate(client, checkout, today);
        await this.audit(
          client,
          user.id,
          scope.property_id,
          `lease.checkout.${action}`,
          'lease_checkout_command',
          commandId,
          { state: checkout.state },
          { state: updated.state },
          context,
        );
        await this.outbox(
          client,
          scope.property_id,
          `lease.checkout_${action}:${commandId}`,
          `lease.checkout.${action}`,
          'lease_checkout_command',
          commandId,
          user.id,
          context,
          { checkout_command_id: commandId, lease_id: leaseId, state: updated.state },
        );
        return {
          resourceType: 'lease_checkout_command',
          resourceId: commandId,
          data: { checkout: updated },
        };
      },
    );
  }

  private async settleCheckoutRefund(
    user: UserAccessContext,
    propertyId: string,
    leaseId: string,
    commandId: string,
    refundId: string,
    status: 'settled' | 'waived',
    dto: SettleRefundDto | WaiveRefundDto,
    key: string | undefined,
    context: LeaseAuditContext,
  ) {
    return this.command(
      user,
      propertyId,
      `POST /leases/${leaseId}/checkout/${commandId}/refunds/${refundId}/${status}`,
      key,
      dto,
      context,
      200,
      async (client, today) => {
        const checkout = await this.lockCheckout(client, commandId, leaseId);
        this.requireState(checkout, 'completed');
        const refund = await client.query<{
          id: string;
          amount: string;
          refund_due_date: string | null;
        }>(
          `SELECT id,amount,refund_due_date::text
           FROM lease_deposit_transactions
           WHERE id=$1 AND property_id=$2 AND lease_id=$3 AND transaction_type='refund'
             AND settlement_status='pending' AND metadata->>'checkout_command_id'=$4
           FOR UPDATE`,
          [refundId, propertyId, leaseId, commandId],
        );
        const row = refund.rows[0];
        if (!row)
          throw new ConflictException({
            code: 'CHECKOUT_REFUND_STATE_CONFLICT',
            message: 'Checkout refund is not pending',
          });
        const late = row.refund_due_date !== null && today > row.refund_due_date;
        const settled = status === 'settled' ? (dto as SettleRefundDto) : null;
        const waived = status === 'waived' ? (dto as WaiveRefundDto) : null;
        await client.query(
          `INSERT INTO lease_refund_settlements(property_id,deposit_transaction_id,settlement_status,payment_method,external_reference,reason,settled_by_user_id,metadata)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            propertyId,
            refundId,
            status,
            settled?.payment_method ?? null,
            settled?.external_reference ?? null,
            waived?.reason.trim() ?? null,
            user.id,
            JSON.stringify({ checkout_command_id: commandId, late_settlement: late }),
          ],
        );
        await client.query(
          `UPDATE lease_deposit_transactions
           SET settlement_status=$2,external_reference=$3,settled_at=now(),settled_by_user_id=$4
           WHERE id=$1`,
          [refundId, status, settled?.external_reference ?? null, user.id],
        );
        await this.audit(
          client,
          user.id,
          propertyId,
          `lease.checkout.refund_${status}`,
          'lease_deposit_transaction',
          refundId,
          { settlement_status: 'pending', refund_due_date: row.refund_due_date },
          { settlement_status: status, late_settlement: late, amount: Number(row.amount) },
          context,
        );
        await this.outbox(
          client,
          propertyId,
          `lease.checkout_refund_${status}:${refundId}`,
          `lease.checkout.refund_${status}`,
          'lease_checkout_command',
          commandId,
          user.id,
          context,
          {
            checkout_command_id: commandId,
            lease_id: leaseId,
            refund_transaction_id: refundId,
            late_settlement: late,
          },
        );
        return {
          resourceType: 'lease_deposit_transaction',
          resourceId: refundId,
          data: { refund_id: refundId, settlement_status: status, late_settlement: late },
        };
      },
    );
  }

  private async applyInvoiceCredits(
    client: PoolClient,
    checkout: CheckoutRow,
    invoices: InvoiceRow[],
    balance: number,
    actorId: string,
  ) {
    let remaining = balance;
    const credits: { invoiceId: string; amount: number }[] = [];
    for (const invoice of invoices) {
      const outstanding = Math.max(
        0,
        Number(invoice.total_amount) -
          Number(invoice.credit_amount) -
          Number(invoice.net_allocated),
      );
      const amount = Math.min(remaining, outstanding);
      if (!amount) continue;
      const deposit = await client.query<{ id: string }>(
        `INSERT INTO lease_deposit_transactions(property_id,lease_id,transaction_type,direction,amount,reason_type,reason,settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id) VALUES($1,$2,'deduction','debit',$3,'checkout_invoice_offset','Checkout deposit offset for invoice',$4,now(),$5,$6::jsonb,$5) RETURNING id`,
        [
          checkout.property_id,
          checkout.lease_id,
          amount,
          'settled',
          actorId,
          JSON.stringify({ checkout_command_id: checkout.id, invoice_id: invoice.id }),
        ],
      );
      await client.query(
        `INSERT INTO lease_checkout_invoice_credits(property_id,checkout_command_id,lease_id,invoice_id,deposit_transaction_id,amount,invoice_credit_before_amount,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          checkout.property_id,
          checkout.id,
          checkout.lease_id,
          invoice.id,
          deposit.rows[0].id,
          amount,
          Number(invoice.credit_amount),
          actorId,
        ],
      );
      await client.query(
        `UPDATE invoices SET credit_amount=credit_amount+$2,updated_at=now() WHERE id=$1 AND property_id=$3`,
        [invoice.id, amount, checkout.property_id],
      );
      await this.w06Billing.reconcileInvoiceLifecycleInTransaction(
        client,
        checkout.property_id,
        invoice.id,
      );
      credits.push({ invoiceId: invoice.id, amount });
      remaining -= amount;
    }
    return credits;
  }

  private async assertEvidenceComplete(client: PoolClient, checkout: CheckoutRow) {
    const result = await client.query<{ evidence_category: string }>(
      `SELECT DISTINCT evidence_category FROM lease_checkout_evidence WHERE checkout_command_id=$1 AND property_id=$2`,
      [checkout.id, checkout.property_id],
    );
    const categories = new Set(result.rows.map((row) => row.evidence_category));
    for (const category of ['keys_access', 'inventory', 'parking', 'inspection'])
      if (!categories.has(category))
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_EVIDENCE_REQUIRED',
          message: `Checkout ${category} evidence is required`,
        });
  }
  private assertHandoverConfirmations(dto: RecordLeaseCheckoutHandoverDto) {
    const missing = [
      !dto.key_access_confirmed && 'keys/access',
      !dto.inventory_confirmed && 'inventory',
      !dto.parking_confirmed && 'parking',
    ].filter(Boolean);
    if (missing.length)
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_HANDOVER_CONFIRMATION_REQUIRED',
        message: `Checkout handover must confirm ${missing.join(', ')}`,
      });
  }
  private async insertEvidence(
    client: PoolClient,
    checkout: CheckoutRow,
    category: string,
    fileIds: string[] | undefined,
    actorId: string,
    metadata: Record<string, unknown>,
  ) {
    const ids = [...new Set(fileIds ?? [])];
    if (ids.length !== (fileIds?.length ?? 0))
      throw new BadRequestException({
        code: 'CHECKOUT_EVIDENCE_DUPLICATE',
        message: 'Checkout evidence file ids must be unique',
      });
    await this.assertFiles(client, checkout.property_id, ids);
    if (!ids.length)
      await client.query(
        `INSERT INTO lease_checkout_evidence(property_id,checkout_command_id,evidence_category,metadata,recorded_by_user_id) VALUES($1,$2,$3,$4::jsonb,$5)`,
        [checkout.property_id, checkout.id, category, JSON.stringify(metadata), actorId],
      );
    for (const fileId of ids)
      await client.query(
        `INSERT INTO lease_checkout_evidence(property_id,checkout_command_id,evidence_category,file_id,metadata,recorded_by_user_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [checkout.property_id, checkout.id, category, fileId, JSON.stringify(metadata), actorId],
      );
  }
  private async assertFiles(client: PoolClient, propertyId: string, ids: string[]) {
    if (!ids.length) return;
    const files = await client.query<{ id: string }>(
      `SELECT id FROM files WHERE id=ANY($1::uuid[]) AND property_id=$2 AND is_deleted=false FOR SHARE`,
      [ids, propertyId],
    );
    if (files.rows.length !== ids.length)
      throw new ConflictException({
        code: 'CHECKOUT_EVIDENCE_SCOPE_INVALID',
        message: 'Checkout evidence file is unavailable',
      });
  }
  private async lockInvoices(client: PoolClient, leaseId: string) {
    const result = await client.query<InvoiceRow>(
      `SELECT i.id,i.total_amount,i.credit_amount,COALESCE(allocation.net,0) AS net_allocated FROM invoices i LEFT JOIN LATERAL (SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS net FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id) allocation ON true WHERE i.lease_id=$1 AND i.invoice_status<>'void' ORDER BY i.due_date,i.id FOR UPDATE OF i`,
      [leaseId],
    );
    return result.rows;
  }
  private async lockDepositBalance(client: PoolClient, leaseId: string) {
    const result = await client.query<LedgerRow>(
      `SELECT direction,amount FROM lease_deposit_transactions WHERE lease_id=$1 ORDER BY created_at,id FOR UPDATE`,
      [leaseId],
    );
    const balance = result.rows.reduce(
      (sum, row) => sum + (row.direction === 'credit' ? Number(row.amount) : -Number(row.amount)),
      0,
    );
    if (balance < 0)
      throw new ConflictException({
        code: 'CHECKOUT_DEPOSIT_LEDGER_INVALID',
        message: 'Deposit ledger is negative',
      });
    return balance;
  }
  private async lockResidentParking(client: PoolClient, propertyId: string, residentId: string) {
    await client.query(
      `SELECT slot.id FROM parking_slots slot JOIN parking_zones zone ON zone.id=slot.zone_id JOIN vehicles vehicle ON vehicle.id=slot.vehicle_id WHERE zone.property_id=$1 AND vehicle.property_id=$1 AND vehicle.resident_id=$2 ORDER BY slot.id FOR UPDATE OF slot, vehicle`,
      [propertyId, residentId],
    );
  }
  private async lockOccupancyAndRoom(client: PoolClient, checkout: CheckoutRow) {
    const occupancy = await client.query<{ id: string }>(
      `SELECT id FROM occupancies WHERE id=$1 AND property_id=$2 AND occupancy_status='active' FOR UPDATE`,
      [checkout.occupancy_id, checkout.property_id],
    );
    if (!occupancy.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_OCCUPANCY_CONFLICT',
        message: 'Active occupancy is required',
      });
    const room = await client.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id=$1 AND property_id=$2 AND room_status='occupied' FOR UPDATE`,
      [checkout.room_id, checkout.property_id],
    );
    if (!room.rows[0])
      throw new ConflictException({
        code: 'CHECKOUT_ROOM_CONFLICT',
        message: 'Occupied room is required',
      });
  }
  private async lockProperty(client: PoolClient, propertyId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM properties WHERE id=$1 AND status='active' FOR UPDATE`,
      [propertyId],
    );
    if (!result.rows[0])
      throw new UnprocessableEntityException({
        code: 'PROPERTY_NOT_ACTIVE',
        message: 'Property is not active',
      });
  }
  private async lockLease(client: PoolClient, leaseId: string) {
    const result = await client.query<LeaseRow>(
      `SELECT id,property_id,occupancy_id,resident_id,room_id,lease_status FROM leases WHERE id=$1 FOR UPDATE`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }
  private async lockCheckout(client: PoolClient, id: string, leaseId: string) {
    const result = await client.query<CheckoutRow>(
      `SELECT id,property_id,lease_id,occupancy_id,resident_id,room_id,state,effective_date::text,notice_recorded_date::text,notice_reason,notice_exception_reason FROM lease_checkout_commands WHERE id=$1 AND lease_id=$2 FOR UPDATE`,
      [id, leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'CHECKOUT_COMMAND_NOT_FOUND',
        message: 'Checkout command not found',
      });
    return result.rows[0];
  }
  private async lookupScope(leaseId: string) {
    const result = await this.leases.query<{ property_id: string }>(
      `SELECT property_id FROM leases WHERE id=$1`,
      [leaseId],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'LEASE_NOT_FOUND', message: 'Lease not found' });
    return result.rows[0];
  }
  private assertAdmin(user: UserAccessContext, propertyId: string, financial = false) {
    if (
      !user.roles.includes('admin') ||
      !user.permissions.includes('lease.manage') ||
      (financial && !user.permissions.includes('billing.manage')) ||
      !user.propertyIds.includes(propertyId)
    )
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only an in-scope Admin with lease.manage may mutate checkout',
      });
  }
  private assertActive(lease: LeaseRow) {
    if (lease.lease_status !== 'active')
      throw new ConflictException({
        code: 'LEASE_STATE_CONFLICT',
        message: 'Only an active lease may be checked out',
      });
  }
  private requireState(checkout: CheckoutRow, expected: string) {
    if (checkout.state !== expected)
      throw new ConflictException({
        code: 'CHECKOUT_STATE_CONFLICT',
        message: `Checkout must be ${expected}`,
      });
  }
  private async jakartaToday(client: PoolClient) {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }
  private async history(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    type: string,
    actorId: string,
    date: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata) VALUES($1,$2,$3,$4,$5::date,$6::jsonb)`,
      [propertyId, leaseId, type, actorId, date, JSON.stringify(metadata)],
    );
  }
  private async audit(
    client: PoolClient,
    actor: string,
    property: string,
    action: string,
    type: string,
    id: string,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown>,
    context: LeaseAuditContext,
  ) {
    await client.query(
      `INSERT INTO audit_logs(actor_user_id,property_id,action,resource_type,resource_id,before_data,after_data,result_status,ip_address,user_agent,correlation_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'success',$8::inet,$9,$10)`,
      [
        actor,
        property,
        action,
        type,
        id,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
        context.ipAddress ?? null,
        context.userAgent ?? null,
        context.correlationId ?? null,
      ],
    );
  }
  private async outbox(
    client: PoolClient,
    property: string,
    eventKey: string,
    eventType: string,
    aggregate: string,
    id: string,
    actor: string,
    context: LeaseAuditContext,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(event_key) DO NOTHING`,
      [
        property,
        eventKey,
        eventType,
        aggregate,
        id,
        JSON.stringify(payload),
        context.correlationId ?? null,
        actor,
      ],
    );
  }
  private async command<T>(
    user: UserAccessContext,
    propertyId: string,
    route: string,
    rawKey: string | undefined,
    payload: unknown,
    context: LeaseAuditContext,
    status: number,
    operation: (
      client: PoolClient,
      today: string,
    ) => Promise<{ resourceType: string; resourceId: string; data: T }>,
  ): Promise<IdempotentResult<T>> {
    const key = rawKey?.trim();
    if (!key || key.length < 16 || key.length > 128)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required',
      });
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ route, actor: user.id, propertyId, payload }))
      .digest('hex');
    return this.leases.transaction(async (client) => {
      const inserted = await client.query<IdempotencyRow>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,correlation_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING request_fingerprint,command_status,response_status,response_body`,
        [propertyId, user.id, route, key, fingerprint, context.correlationId ?? null],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_fingerprint,command_status,response_status,response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [user.id, route, key],
        );
        const row = existing.rows[0];
        if (!row || row.command_status === 'pending' || !row.response_status || !row.response_body)
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command is unavailable for replay',
          });
        if (row.request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used with a different request payload',
          });
        return {
          status: row.response_status,
          body: row.response_body as { data: T },
          replayed: true,
        };
      }
      const result = await operation(client, await this.jakartaToday(client));
      const body = { data: result.data };
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded',response_status=$2,response_body=$3::jsonb,resource_type=$4,resource_id=$5,completed_at=now() WHERE actor_user_id=$1 AND route=$6 AND idempotency_key=$7`,
        [user.id, status, JSON.stringify(body), result.resourceType, result.resourceId, route, key],
      );
      return { status, body, replayed: false };
    });
  }
}
