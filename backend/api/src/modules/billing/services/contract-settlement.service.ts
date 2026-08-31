import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { RequestAuditContext } from '../../property/types/property.types';
import { W06BillingService } from './w06-billing.service';
import {
  CancelLeaseTerminationDto,
  ExtendContractSettlementDto,
  FinalizeLeaseTerminationDto,
  RecordLeasePaymentPromiseDto,
  StartLeaseTerminationDto,
} from '../dto/contract-settlement.dto';

type SettlementLock = {
  id: string;
  property_id: string;
  lease_id: string;
  invoice_id: string;
  state: 'awaiting_activation' | 'open' | 'termination_pending' | 'terminated' | 'paid';
  activated_at: Date | null;
  original_due_at: Date | null;
  extension_due_at: Date | null;
  total_amount: string;
  credit_amount: string;
  allocated_amount: string;
  room_id: string;
  occupancy_id: string | null;
  lease_status: string;
  policy_snapshot_id: string | null;
};

type V2MissedCheckpointLock = {
  checkpoint_id: string;
  policy_snapshot_id: string;
  checkpoint_code: 'checkpoint_1' | 'checkpoint_2' | 'final_settlement';
  original_due_at: Date;
  extension_id: string | null;
  extension_due_at: Date | null;
  contract_rent_amount: string;
  verified_rent_credit: string;
  outstanding_amount: string;
  shortfall_amount: string;
};

type TerminationLock = {
  id: string;
  status: 'pending' | 'cancelled' | 'checked_out';
  planned_checkout_date: string;
};

@Injectable()
export class ContractSettlementService {
  private readonly maxIdempotencyLength = 128;

  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly w06Billing: W06BillingService,
  ) {}

  async extend(
    actor: UserAccessContext,
    leaseId: string,
    dto: ExtendContractSettlementDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      leaseId,
      '/admin/billing/leases/:leaseId/contract-settlement/extend',
      key,
      dto,
      context,
      async (client, settlement) => {
        if (settlement.policy_snapshot_id)
          return this.extendV2(client, actor, settlement, dto, context);
        if (settlement.state !== 'open' || !settlement.activated_at || !settlement.original_due_at)
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_EXTENSION_NOT_AVAILABLE',
            message: 'A settlement extension is available only for an active contract balance',
          });
        if (settlement.extension_due_at)
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_EXTENSION_ALREADY_USED',
            message: 'Only one settlement extension can be granted',
          });
        if (!(await this.deadlineHasPassed(client, settlement.original_due_at)))
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_EXTENSION_NOT_DUE',
            message: 'The original settlement deadline has not been reached',
          });
        if (!(await this.deadlineIsFuture(client, settlement.original_due_at, dto.extension_days)))
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_EXTENSION_DEADLINE_NOT_FUTURE',
            message: 'The selected extension deadline must still be in the future',
          });
        const outstanding = this.outstanding(settlement);
        if (outstanding === 0)
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_ALREADY_PAID',
            message: 'A fully paid contract balance cannot be extended',
          });
        const updated = await client.query<{ extension_due_at: Date }>(
          `UPDATE lease_contract_settlements
              SET extension_due_at=original_due_at + ($3::int * INTERVAL '1 day'),
                  extension_reason=$4,
                  extension_granted_at=now(),
                  extension_granted_by_user_id=$5,
                  updated_at=now()
            WHERE id=$1 AND property_id=$2 AND extension_due_at IS NULL
            RETURNING extension_due_at`,
          [settlement.id, dto.property_id, dto.extension_days, dto.reason.trim(), actor.id],
        );
        if (!updated.rows[0])
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_EXTENSION_CONFLICT',
            message: 'The settlement extension could not be recorded',
          });
        const data = {
          settlement_id: settlement.id,
          extension_due_at: updated.rows[0].extension_due_at.toISOString(),
          extension_days: dto.extension_days,
        };
        await this.auditAndEvent(
          client,
          actor,
          dto.property_id,
          'lease.contract_settlement_extended',
          'lease_contract_settlement',
          settlement.id,
          data,
          context,
        );
        return data;
      },
    );
  }

  async recordPaymentPromise(
    actor: UserAccessContext,
    leaseId: string,
    dto: RecordLeasePaymentPromiseDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      leaseId,
      '/admin/billing/leases/:leaseId/contract-settlement/payment-promise',
      key,
      dto,
      context,
      async (client, settlement) => {
        if (
          !settlement.policy_snapshot_id ||
          settlement.state !== 'open' ||
          !settlement.activated_at
        )
          throw new ConflictException({
            code: 'LEASE_PAYMENT_PROMISE_NOT_AVAILABLE',
            message: 'A payment promise is available only for an active v2 settlement',
          });
        const checkpoint = await this.lockV2MissedCheckpoint(client, settlement);
        const date = await client.query<{ valid: boolean }>(
          `SELECT $1::date >= (now() AT TIME ZONE 'Asia/Jakarta')::date AS valid`,
          [dto.promised_payment_date],
        );
        if (date.rows[0]?.valid !== true)
          throw new ConflictException({
            code: 'LEASE_PAYMENT_PROMISE_DATE_INVALID',
            message: 'The promised payment date cannot be in the past',
          });
        if (dto.promised_amount > this.money(checkpoint.outstanding_amount))
          throw new UnprocessableEntityException({
            code: 'LEASE_PAYMENT_PROMISE_AMOUNT_EXCEEDS_OUTSTANDING',
            message: 'The promised amount cannot exceed the current contract balance',
          });

        const inserted = await client.query<{ id: string; recorded_at: Date }>(
          `INSERT INTO lease_payment_promises(
             property_id,lease_id,policy_snapshot_id,checkpoint_id,promised_amount,
             promised_payment_date,note,recorded_by_user_id
           ) VALUES($1,$2,$3,$4,$5,$6::date,$7,$8)
           RETURNING id,recorded_at`,
          [
            dto.property_id,
            settlement.lease_id,
            checkpoint.policy_snapshot_id,
            checkpoint.checkpoint_id,
            dto.promised_amount,
            dto.promised_payment_date,
            dto.note.trim(),
            actor.id,
          ],
        );
        const promise = inserted.rows[0];
        const data = {
          promise_id: promise.id,
          lease_id: settlement.lease_id,
          checkpoint_id: checkpoint.checkpoint_id,
          promised_amount: dto.promised_amount,
          promised_payment_date: dto.promised_payment_date,
          note: dto.note.trim(),
          recorded_at: promise.recorded_at.toISOString(),
          overdue_status_unchanged: true,
        };
        await client.query(
          `INSERT INTO lease_settlement_checkpoint_events(
             property_id,lease_id,checkpoint_id,event_type,event_key,actor_user_id,metadata
           ) VALUES($1,$2,$3,'promise_to_pay_recorded',$4,$5,$6::jsonb)`,
          [
            dto.property_id,
            settlement.lease_id,
            checkpoint.checkpoint_id,
            `promise_to_pay_recorded:${promise.id}`,
            actor.id,
            JSON.stringify(data),
          ],
        );
        await this.auditAndEvent(
          client,
          actor,
          dto.property_id,
          'lease.payment_promise_recorded',
          'lease_payment_promise',
          promise.id,
          data,
          context,
        );
        return data;
      },
    );
  }

  private async extendV2(
    client: PoolClient,
    actor: UserAccessContext,
    settlement: SettlementLock,
    dto: ExtendContractSettlementDto,
    context: RequestAuditContext,
  ) {
    if (settlement.state !== 'open' || !settlement.activated_at)
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_EXTENSION_NOT_AVAILABLE',
        message: 'A settlement extension is available only for an active contract balance',
      });
    const checkpoint = await this.lockV2MissedCheckpoint(client, settlement);
    if (checkpoint.extension_id)
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_EXTENSION_ALREADY_USED',
        message: 'Only one settlement extension can be granted',
      });
    if (!(await this.deadlineIsFuture(client, checkpoint.original_due_at, dto.extension_days)))
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_EXTENSION_DEADLINE_NOT_FUTURE',
        message: 'The selected extension deadline must still be in the future',
      });

    const inserted = await client.query<{ id: string; extension_due_at: Date; granted_at: Date }>(
      `INSERT INTO lease_settlement_extensions(
         property_id,lease_id,policy_snapshot_id,checkpoint_id,original_due_at,
         extension_due_at,reason,granted_by_user_id
       ) VALUES($1,$2,$3,$4,$5,$5 + ($6::int * INTERVAL '1 day'),$7,$8)
       ON CONFLICT(lease_id) DO NOTHING
       RETURNING id,extension_due_at,granted_at`,
      [
        dto.property_id,
        settlement.lease_id,
        checkpoint.policy_snapshot_id,
        checkpoint.checkpoint_id,
        checkpoint.original_due_at,
        dto.extension_days,
        dto.reason.trim(),
        actor.id,
      ],
    );
    const extension = inserted.rows[0];
    if (!extension)
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_EXTENSION_CONFLICT',
        message: 'The settlement extension could not be recorded',
      });
    const data = {
      settlement_id: settlement.id,
      checkpoint_id: checkpoint.checkpoint_id,
      extension_id: extension.id,
      original_due_at: checkpoint.original_due_at.toISOString(),
      extension_due_at: extension.extension_due_at.toISOString(),
      extension_days: dto.extension_days,
      reason: dto.reason.trim(),
      granted_at: extension.granted_at.toISOString(),
      original_overdue_preserved: true,
    };
    await client.query(
      `INSERT INTO lease_settlement_checkpoint_events(
         property_id,lease_id,checkpoint_id,event_type,event_key,actor_user_id,metadata
       ) VALUES($1,$2,$3,'extension_granted',$4,$5,$6::jsonb)`,
      [
        dto.property_id,
        settlement.lease_id,
        checkpoint.checkpoint_id,
        `extension_granted:${extension.id}`,
        actor.id,
        JSON.stringify(data),
      ],
    );
    await this.notifySettlementActors(client, {
      propertyId: dto.property_id,
      leaseId: settlement.lease_id,
      checkpointId: checkpoint.checkpoint_id,
      notificationKind: 'extension_granted',
      title: 'Perpanjangan pembayaran disetujui',
      body: `Tenggat awal tetap tercatat. Tenggat perpanjangan berlaku sampai ${extension.extension_due_at.toISOString()}.`,
      metadata: data,
      correlationId: context.correlationId,
    });
    await this.auditAndEvent(
      client,
      actor,
      dto.property_id,
      'lease.contract_settlement_extended',
      'lease_contract_settlement',
      settlement.id,
      data,
      context,
    );
    return data;
  }

  private async lockV2MissedCheckpoint(
    client: PoolClient,
    settlement: SettlementLock,
  ): Promise<V2MissedCheckpointLock> {
    const result = await client.query<V2MissedCheckpointLock>(
      `WITH ledger AS (
         SELECT COALESCE(sum(contract_invoice.credit_amount + COALESCE(allocation.net,0)),0) AS verified_rent_credit
           FROM invoices contract_invoice
           LEFT JOIN LATERAL (
             SELECT COALESCE(sum(payment_allocation.allocated_amount
                      - COALESCE(reversal.reversed_amount,0)),0) AS net
               FROM payment_allocations payment_allocation
               LEFT JOIN LATERAL (
                 SELECT COALESCE(sum(reversal_allocation.reversed_amount),0) AS reversed_amount
                   FROM payment_reversal_allocations reversal_allocation
                  WHERE reversal_allocation.original_allocation_id=payment_allocation.id
               ) reversal ON true
              WHERE payment_allocation.invoice_id=contract_invoice.id
           ) allocation ON true
          WHERE contract_invoice.property_id=$1
            AND contract_invoice.lease_id=$2
            AND contract_invoice.invoice_purpose='rent'
            AND contract_invoice.authority_source='contract_schedule'
            AND contract_invoice.invoice_status<>'void'
       ), authority AS (
         SELECT checkpoint.id AS checkpoint_id,checkpoint.policy_snapshot_id,
                checkpoint.checkpoint_code,checkpoint.due_at AS original_due_at,
                extension.id AS extension_id,extension.extension_due_at,
                lease.contract_rent_amount,
                ledger.verified_rent_credit,
                GREATEST(lease.contract_rent_amount-ledger.verified_rent_credit,0) AS outstanding_amount,
                CASE WHEN checkpoint.settlement_mode='exact_remaining_balance'
                     THEN GREATEST(lease.contract_rent_amount-ledger.verified_rent_credit,0)
                     ELSE GREATEST(checkpoint.minimum_required_amount-ledger.verified_rent_credit,0)
                END AS shortfall_amount,
                checkpoint.checkpoint_sequence
           FROM lease_settlement_checkpoints checkpoint
           JOIN leases lease ON lease.id=checkpoint.lease_id AND lease.property_id=checkpoint.property_id
           CROSS JOIN ledger
           LEFT JOIN lease_settlement_extensions extension
             ON extension.lease_id=checkpoint.lease_id AND extension.property_id=checkpoint.property_id
          WHERE checkpoint.property_id=$1 AND checkpoint.lease_id=$2
            AND checkpoint.policy_snapshot_id=$3
            AND checkpoint.due_at < now()
       )
       SELECT checkpoint_id,policy_snapshot_id,checkpoint_code,original_due_at,
              extension_id,extension_due_at,contract_rent_amount,verified_rent_credit,
              outstanding_amount,shortfall_amount
         FROM authority
        WHERE shortfall_amount>0
        ORDER BY checkpoint_sequence
        LIMIT 1`,
      [settlement.property_id, settlement.lease_id, settlement.policy_snapshot_id],
    );
    if (!result.rows[0])
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_EXTENSION_NOT_DUE',
        message: 'No missed checkpoint with an outstanding balance is available',
      });
    return result.rows[0];
  }

  private async notifySettlementActors(
    client: PoolClient,
    input: {
      propertyId: string;
      leaseId: string;
      checkpointId: string;
      notificationKind: 'extension_granted';
      title: string;
      body: string;
      metadata: Record<string, unknown>;
      correlationId?: string;
    },
  ) {
    const recipients = await client.query<{ user_id: string }>(
      `SELECT DISTINCT recipient.user_id
         FROM (
           SELECT resident.user_id
             FROM leases lease
             JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
             JOIN users resident_account
               ON resident_account.id=resident.user_id AND resident_account.user_status='active'
            WHERE lease.id=$2 AND lease.property_id=$1
           UNION
           SELECT membership.user_id
             FROM user_property_roles membership
             JOIN roles role ON role.id=membership.role_id AND role.code='admin'
             JOIN users account ON account.id=membership.user_id AND account.user_status='active'
            WHERE membership.property_id=$1 AND membership.revoked_at IS NULL
         ) recipient`,
      [input.propertyId, input.leaseId],
    );
    for (const recipient of recipients.rows) {
      const ledger = await client.query<{ id: string }>(
        `INSERT INTO lease_settlement_notification_ledger(
           property_id,lease_id,checkpoint_id,notification_kind,recipient_user_id,trigger_business_date
         ) VALUES($1,$2,$3,$4,$5,(now() AT TIME ZONE 'Asia/Jakarta')::date)
         ON CONFLICT(checkpoint_id,notification_kind,recipient_user_id) DO NOTHING
         RETURNING id`,
        [
          input.propertyId,
          input.leaseId,
          input.checkpointId,
          input.notificationKind,
          recipient.user_id,
        ],
      );
      if (!ledger.rows[0]) continue;
      const notification = await client.query<{ id: string }>(
        `INSERT INTO notifications(
           property_id,recipient_user_id,notification_type,priority,title,body,metadata,
           source_event_type,source_resource_id,correlation_id,expires_at
         ) VALUES($1,$2,$3,'high',$4,$5,$6::jsonb,'lease.settlement_extension_granted',$7,$8,
                  now()+INTERVAL '90 days')
         RETURNING id`,
        [
          input.propertyId,
          recipient.user_id,
          `lease_settlement_${input.notificationKind}`,
          input.title,
          input.body,
          JSON.stringify(input.metadata),
          input.checkpointId,
          input.correlationId ?? null,
        ],
      );
      await client.query(
        `UPDATE lease_settlement_notification_ledger SET notification_id=$2 WHERE id=$1`,
        [ledger.rows[0].id, notification.rows[0].id],
      );
    }
  }

  async startTermination(
    actor: UserAccessContext,
    leaseId: string,
    dto: StartLeaseTerminationDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      leaseId,
      '/admin/billing/leases/:leaseId/contract-settlement/termination',
      key,
      dto,
      context,
      async (client, settlement) => {
        const v2Checkpoint = settlement.policy_snapshot_id
          ? await this.lockV2MissedCheckpoint(client, settlement)
          : null;
        const terminationEligible = v2Checkpoint
          ? await this.v2TerminationIsEligible(client, v2Checkpoint)
          : Boolean(
              settlement.original_due_at &&
              (await this.partialPaymentWindowHasClosed(
                client,
                settlement.original_due_at,
                settlement.extension_due_at,
              )),
            );
        if (!terminationEligible)
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_NOT_FINAL_OVERDUE',
            message: 'Lease termination can start only after the payment resolution window closes',
          });
        const outstandingAmount = v2Checkpoint
          ? this.money(v2Checkpoint.outstanding_amount)
          : this.outstanding(settlement);
        if (outstandingAmount <= 0)
          throw new ConflictException({
            code: 'CONTRACT_SETTLEMENT_ALREADY_PAID',
            message: 'A fully paid contract balance cannot be terminated for arrears',
          });
        if (settlement.state === 'termination_pending')
          throw new ConflictException({
            code: 'LEASE_TERMINATION_ALREADY_PENDING',
            message: 'A lease termination process is already in progress',
          });
        const caseResult = await client.query<{ id: string }>(
          `INSERT INTO lease_termination_cases(
             property_id,lease_id,settlement_id,status,reason,notes,planned_checkout_date,started_by_user_id
           ) VALUES($1,$2,$3,'pending',$4,$5,$6::date,$7)
           RETURNING id`,
          [
            dto.property_id,
            leaseId,
            settlement.id,
            dto.reason.trim(),
            dto.notes?.trim() || null,
            dto.planned_checkout_date,
            actor.id,
          ],
        );
        await client.query(
          `UPDATE lease_contract_settlements
              SET state='termination_pending',updated_at=now()
            WHERE id=$1 AND property_id=$2 AND state='open'`,
          [settlement.id, dto.property_id],
        );
        const data = {
          termination_case_id: caseResult.rows[0].id,
          status: 'pending' as const,
          planned_checkout_date: dto.planned_checkout_date,
          outstanding_amount: outstandingAmount,
        };
        if (v2Checkpoint)
          await client.query(
            `INSERT INTO lease_settlement_checkpoint_events(
               property_id,lease_id,checkpoint_id,event_type,event_key,actor_user_id,metadata
             ) VALUES($1,$2,$3,'termination_started',$4,$5,$6::jsonb)
             ON CONFLICT(property_id,event_key) WHERE event_key IS NOT NULL DO NOTHING`,
            [
              dto.property_id,
              settlement.lease_id,
              v2Checkpoint.checkpoint_id,
              `termination_started:${caseResult.rows[0].id}`,
              actor.id,
              JSON.stringify(data),
            ],
          );
        await this.auditAndEvent(
          client,
          actor,
          dto.property_id,
          'lease.termination_started',
          'lease_termination_case',
          caseResult.rows[0].id,
          data,
          context,
        );
        return data;
      },
    );
  }

  async cancelTermination(
    actor: UserAccessContext,
    leaseId: string,
    dto: CancelLeaseTerminationDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      leaseId,
      '/admin/billing/leases/:leaseId/contract-settlement/termination/cancel',
      key,
      dto,
      context,
      async (client, settlement) => {
        if (settlement.state !== 'termination_pending')
          throw new ConflictException({
            code: 'LEASE_TERMINATION_NOT_PENDING',
            message: 'There is no pending lease termination to cancel',
          });
        if (this.outstanding(settlement) !== 0)
          throw new ConflictException({
            code: 'LEASE_TERMINATION_BALANCE_REMAINS',
            message: 'The remaining contract-rent balance must be paid before cancellation',
          });
        const termination = await this.lockPendingTermination(
          client,
          dto.property_id,
          settlement.id,
        );
        await client.query(
          `UPDATE lease_termination_cases
              SET status='cancelled',cancelled_by_user_id=$2,cancelled_at=now(),cancellation_reason=$3,updated_at=now()
            WHERE id=$1 AND status='pending'`,
          [termination.id, actor.id, dto.reason.trim()],
        );
        await client.query(
          `UPDATE lease_contract_settlements SET state='paid',updated_at=now() WHERE id=$1`,
          [settlement.id],
        );
        const data = { termination_case_id: termination.id, status: 'cancelled' as const };
        await this.auditAndEvent(
          client,
          actor,
          dto.property_id,
          'lease.termination_cancelled_after_settlement',
          'lease_termination_case',
          termination.id,
          data,
          context,
        );
        return data;
      },
    );
  }

  async finalizeTermination(
    actor: UserAccessContext,
    leaseId: string,
    dto: FinalizeLeaseTerminationDto,
    key: string | undefined,
    context: RequestAuditContext,
  ) {
    return this.command(
      actor,
      dto.property_id,
      leaseId,
      '/admin/billing/leases/:leaseId/contract-settlement/termination/finalize',
      key,
      dto,
      context,
      async (client, settlement) => {
        if (settlement.state !== 'termination_pending')
          throw new ConflictException({
            code: 'LEASE_TERMINATION_NOT_PENDING',
            message: 'There is no pending lease termination to finalize',
          });
        if (settlement.lease_status !== 'active' || !settlement.occupancy_id)
          throw new ConflictException({
            code: 'LEASE_TERMINATION_LIFECYCLE_INVALID',
            message: 'Only an active occupied lease can be checked out',
          });
        const termination = await this.lockPendingTermination(
          client,
          dto.property_id,
          settlement.id,
        );
        await this.assertEvidence(
          client,
          dto.property_id,
          dto.damage_evidence_file_id,
          dto.damage_deduction_amount > 0,
        );
        await this.assertEvidence(
          client,
          dto.property_id,
          dto.refund_evidence_file_id,
          dto.refund_amount > 0,
        );
        await client.query(
          `SELECT id
             FROM lease_deposit_transactions
            WHERE property_id=$1 AND lease_id=$2
            ORDER BY id
            FOR UPDATE`,
          [dto.property_id, leaseId],
        );
        const deposit = await client.query<{ balance: string }>(
          `SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) AS balance
             FROM lease_deposit_transactions
            WHERE property_id=$1 AND lease_id=$2`,
          [dto.property_id, leaseId],
        );
        const depositBalance = Math.max(0, this.money(deposit.rows[0]?.balance ?? '0'));
        const outstanding = this.outstanding(settlement);
        const rentOffset = Math.min(depositBalance, outstanding);
        const afterRentOffset = depositBalance - rentOffset;
        if (dto.damage_deduction_amount > afterRentOffset)
          throw new UnprocessableEntityException({
            code: 'LEASE_TERMINATION_DAMAGE_EXCEEDS_DEPOSIT',
            message: 'Documented damage deduction cannot exceed the remaining security deposit',
            details: { available_deposit_amount: afterRentOffset },
          });
        const requiredRefund = afterRentOffset - dto.damage_deduction_amount;
        if (dto.refund_amount !== requiredRefund)
          throw new UnprocessableEntityException({
            code: 'LEASE_TERMINATION_REFUND_AMOUNT_INVALID',
            message: 'Refund amount must equal the remaining security-deposit balance',
            details: { required_refund_amount: requiredRefund },
          });

        if (rentOffset > 0) {
          const depositTransaction = await client.query<{ id: string }>(
            `INSERT INTO lease_deposit_transactions(
               property_id,lease_id,transaction_type,direction,amount,reason_type,reason,
               settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
             ) VALUES($1,$2,'deduction','debit',$3,'termination_rent_offset',$4,'settled',now(),$5,$6::jsonb,$5)
             RETURNING id`,
            [
              dto.property_id,
              leaseId,
              rentOffset,
              `Default security-deposit offset for contract-rent arrears in termination ${termination.id}`,
              actor.id,
              JSON.stringify({ termination_case_id: termination.id, settlement_id: settlement.id }),
            ],
          );
          await client.query(
            `INSERT INTO contract_settlement_deposit_offsets(
              property_id,settlement_id,termination_case_id,lease_id,invoice_id,deposit_transaction_id,amount,
              invoice_credit_before_amount,created_by_user_id
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              dto.property_id,
              settlement.id,
              termination.id,
              leaseId,
              settlement.invoice_id,
              depositTransaction.rows[0].id,
              rentOffset,
              this.money(settlement.credit_amount),
              actor.id,
            ],
          );
          await client.query(
            `UPDATE invoices SET credit_amount=credit_amount+$2,updated_at=now()
              WHERE id=$1 AND property_id=$3`,
            [settlement.invoice_id, rentOffset, dto.property_id],
          );
          await this.w06Billing.reconcileInvoiceLifecycleInTransaction(
            client,
            dto.property_id,
            settlement.invoice_id,
          );
        }
        if (dto.damage_deduction_amount > 0)
          await client.query(
            `INSERT INTO lease_deposit_transactions(
               property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,
               settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
             ) VALUES($1,$2,'deduction','debit',$3,'termination_damage',$4,$5,'settled',now(),$6,$7::jsonb,$6)`,
            [
              dto.property_id,
              leaseId,
              dto.damage_deduction_amount,
              dto.damage_reason!.trim(),
              dto.damage_evidence_file_id,
              actor.id,
              JSON.stringify({ termination_case_id: termination.id }),
            ],
          );
        if (dto.refund_amount > 0)
          await client.query(
            `INSERT INTO lease_deposit_transactions(
               property_id,lease_id,transaction_type,direction,amount,reason_type,reason,evidence_file_id,
               settlement_status,settled_at,settled_by_user_id,metadata,created_by_user_id
             ) VALUES($1,$2,'refund','debit',$3,'termination_refund',$4,$5,'settled',now(),$6,$7::jsonb,$6)`,
            [
              dto.property_id,
              leaseId,
              dto.refund_amount,
              dto.refund_note?.trim() ||
                `Security-deposit refund for termination ${termination.id}`,
              dto.refund_evidence_file_id,
              actor.id,
              JSON.stringify({
                termination_case_id: termination.id,
                method: dto.refund_method,
                refunded_at: dto.refunded_at,
              }),
            ],
          );
        await client.query(
          `UPDATE lease_termination_cases
              SET status='checked_out',checkout_by_user_id=$2,checked_out_at=now(),
                  inspection_notes=$3,room_status_after_checkout=$4,
                  outstanding_rent_before_settlement=$5,deposit_offset_amount=$6,
                  damage_deduction_amount=$7,damage_reason=$8,damage_evidence_file_id=$9,
                  refund_amount=$10,refund_method=$11,refunded_at=$12::timestamptz,
                  refund_note=$13,refund_evidence_file_id=$14,updated_at=now()
            WHERE id=$1 AND status='pending'`,
          [
            termination.id,
            actor.id,
            dto.inspection_notes?.trim() || null,
            dto.room_status_after_checkout,
            outstanding,
            rentOffset,
            dto.damage_deduction_amount,
            dto.damage_reason?.trim() || null,
            dto.damage_evidence_file_id ?? null,
            dto.refund_amount,
            dto.refund_method ?? null,
            dto.refunded_at ?? null,
            dto.refund_note?.trim() || null,
            dto.refund_evidence_file_id ?? null,
          ],
        );
        await client.query(
          `UPDATE occupancies SET occupancy_status='ended',end_date=(now() AT TIME ZONE 'Asia/Jakarta')::date,updated_at=now()
            WHERE id=$1 AND property_id=$2 AND occupancy_status='active'`,
          [settlement.occupancy_id, dto.property_id],
        );
        await client.query(
          `INSERT INTO occupancy_history(occupancy_id,property_id,room_id,resident_id,event_type,from_status,to_status,event_date,actor_user_id,metadata)
           SELECT occupancy.id,occupancy.property_id,occupancy.room_id,occupancy.resident_id,'check_out','active','ended',
                  (now() AT TIME ZONE 'Asia/Jakarta')::date,$2,$3::jsonb
             FROM occupancies occupancy WHERE occupancy.id=$1`,
          [
            settlement.occupancy_id,
            actor.id,
            JSON.stringify({
              source: 'termination_for_arrears',
              termination_case_id: termination.id,
            }),
          ],
        );
        await client.query(
          `UPDATE leases SET lease_status='completed',updated_at=now() WHERE id=$1 AND property_id=$2 AND lease_status='active'`,
          [leaseId, dto.property_id],
        );
        await client.query(
          `UPDATE rooms SET room_status=$3,updated_at=now() WHERE id=$1 AND property_id=$2`,
          [settlement.room_id, dto.property_id, dto.room_status_after_checkout],
        );
        await client.query(
          `INSERT INTO lease_history(property_id,lease_id,event_type,actor_user_id,event_date,metadata)
           VALUES($1,$2,'closed',$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4::jsonb)`,
          [
            dto.property_id,
            leaseId,
            actor.id,
            JSON.stringify({ termination_case_id: termination.id, outstanding_rent: outstanding }),
          ],
        );
        await client.query(
          `UPDATE lease_contract_settlements SET state='terminated',updated_at=now() WHERE id=$1`,
          [settlement.id],
        );
        const data = {
          termination_case_id: termination.id,
          status: 'checked_out' as const,
          rent_outstanding_before_settlement: outstanding,
          deposit_offset_amount: rentOffset,
          damage_deduction_amount: dto.damage_deduction_amount,
          refund_amount: dto.refund_amount,
          room_status_after_checkout: dto.room_status_after_checkout,
        };
        await this.auditAndEvent(
          client,
          actor,
          dto.property_id,
          'lease.termination_checked_out',
          'lease_termination_case',
          termination.id,
          data,
          context,
        );
        return data;
      },
    );
  }

  private async command<T>(
    actor: UserAccessContext,
    propertyId: string,
    leaseId: string,
    route: string,
    key: string | undefined,
    payload: unknown,
    context: RequestAuditContext,
    action: (client: PoolClient, settlement: SettlementLock) => Promise<T>,
  ): Promise<{ data: T }> {
    const idempotencyKey = key?.trim();
    if (
      !idempotencyKey ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > this.maxIdempotencyLength
    )
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    await this.properties.assertCanReadProperty(actor, propertyId);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ leaseId, payload }))
      .digest('hex');
    return this.database.transaction(async (client) => {
      await client.query(`SELECT id FROM properties WHERE id=$1 FOR UPDATE`, [propertyId]);
      const claim = await client.query<{ id: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,correlation_id)
         VALUES($1,$2,$3,$4,$5,'pending',$6)
         ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING id`,
        [propertyId, actor.id, route, idempotencyKey, fingerprint, context.correlationId ?? null],
      );
      if (!claim.rowCount) {
        const replay = await client.query<{
          request_fingerprint: string;
          command_status: string;
          response_body: { data: T } | null;
        }>(
          `SELECT request_fingerprint,command_status,response_body
             FROM idempotency_commands
            WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3
            FOR UPDATE`,
          [actor.id, route, idempotencyKey],
        );
        const stored = replay.rows[0];
        if (!stored || stored.request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key cannot be reused for a different command',
          });
        if (stored.command_status === 'succeeded' && stored.response_body)
          return stored.response_body;
        throw new ConflictException({
          code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
          message: 'An equivalent command is still being processed',
        });
      }
      const settlement = await this.lockSettlement(client, propertyId, leaseId);
      const data = await action(client, settlement);
      await client.query(
        `UPDATE idempotency_commands
            SET command_status='succeeded',response_status=200,response_body=$4::jsonb,
                resource_type='lease_contract_settlement',resource_id=$5,completed_at=now()
          WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3`,
        [actor.id, route, idempotencyKey, JSON.stringify({ data }), settlement.id],
      );
      return { data };
    });
  }

  private async lockSettlement(client: PoolClient, propertyId: string, leaseId: string) {
    const result = await client.query<SettlementLock>(
      `SELECT settlement.id,settlement.property_id,settlement.lease_id,settlement.invoice_id,settlement.state,
              settlement.policy_snapshot_id,
              settlement.activated_at,settlement.original_due_at,settlement.extension_due_at,
              invoice.total_amount,invoice.credit_amount,COALESCE(allocation.net,0) AS allocated_amount,
              lease.room_id,lease.occupancy_id,lease.lease_status
         FROM lease_contract_settlements settlement
         JOIN leases lease ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
         JOIN invoices invoice ON invoice.id=settlement.invoice_id AND invoice.lease_id=lease.id AND invoice.property_id=lease.property_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(payment_allocation.allocated_amount),0)
                    - COALESCE(sum(reversal_allocation.reversed_amount),0) AS net
             FROM payment_allocations payment_allocation
             LEFT JOIN payment_reversal_allocations reversal_allocation
               ON reversal_allocation.original_allocation_id=payment_allocation.id
            WHERE payment_allocation.invoice_id=invoice.id
         ) allocation ON true
        WHERE settlement.property_id=$1 AND settlement.lease_id=$2
        FOR UPDATE OF settlement,lease,invoice`,
      [propertyId, leaseId],
    );
    if (result.rows.length !== 1)
      throw new NotFoundException({
        code: 'CONTRACT_SETTLEMENT_NOT_FOUND',
        message: 'Contract settlement is not available for this lease',
      });
    return result.rows[0];
  }

  private async lockPendingTermination(
    client: PoolClient,
    propertyId: string,
    settlementId: string,
  ) {
    const result = await client.query<TerminationLock>(
      `SELECT id,status,planned_checkout_date::text
         FROM lease_termination_cases
        WHERE property_id=$1 AND settlement_id=$2 AND status='pending'
        FOR UPDATE`,
      [propertyId, settlementId],
    );
    if (result.rows.length !== 1)
      throw new NotFoundException({
        code: 'LEASE_TERMINATION_NOT_PENDING',
        message: 'Pending lease termination is unavailable',
      });
    return result.rows[0];
  }

  private async assertEvidence(
    client: PoolClient,
    propertyId: string,
    fileId: string | undefined,
    required: boolean,
  ) {
    if (!required) return;
    const file = await client.query<{ id: string }>(
      `SELECT id FROM files WHERE id=$1 AND property_id=$2 AND is_deleted=false FOR KEY SHARE`,
      [fileId, propertyId],
    );
    if (file.rowCount !== 1)
      throw new ConflictException({
        code: 'LEASE_TERMINATION_EVIDENCE_INVALID',
        message: 'A safe property-scoped evidence file is required',
      });
  }

  /**
   * Deadline decisions are made by PostgreSQL, not the Node process clock.
   * The deadline itself is stored from the Asia/Jakarta business-date policy;
   * comparing it to `now()` here keeps commands deterministic across clients.
   */
  private async deadlineHasPassed(client: PoolClient, deadline: Date) {
    const result = await client.query<{ passed: boolean }>(
      `SELECT now() > $1::timestamptz AS passed`,
      [deadline],
    );
    return result.rows[0]?.passed === true;
  }

  private async deadlineIsFuture(client: PoolClient, deadline: Date, extensionDays: number) {
    const result = await client.query<{ valid: boolean }>(
      `SELECT $1::timestamptz + ($2::int * INTERVAL '1 day') > now() AS valid`,
      [deadline, extensionDays],
    );
    return result.rows[0]?.valid === true;
  }

  private async v2TerminationIsEligible(client: PoolClient, checkpoint: V2MissedCheckpointLock) {
    const result = await client.query<{ eligible: boolean }>(
      `SELECT now() > $1::timestamptz + INTERVAL '7 days'
              AND ($2::timestamptz IS NULL OR now() > $2::timestamptz) AS eligible`,
      [checkpoint.original_due_at, checkpoint.extension_due_at],
    );
    return result.rows[0]?.eligible === true;
  }

  /**
   * The ordinary partial-payment window ends at the close of D+7. A granted
   * extension supersedes that grace window and ends at its own exact deadline.
   * PostgreSQL remains the clock authority for both branches.
   */
  private async partialPaymentWindowHasClosed(
    client: PoolClient,
    originalDueAt: Date,
    extensionDueAt: Date | null,
  ) {
    const result = await client.query<{ passed: boolean }>(
      `SELECT now() > CASE
         WHEN $2::timestamptz IS NULL THEN $1::timestamptz + INTERVAL '7 days'
         ELSE $2::timestamptz
       END AS passed`,
      [originalDueAt, extensionDueAt],
    );
    return result.rows[0]?.passed === true;
  }

  private outstanding(settlement: SettlementLock) {
    return Math.max(
      0,
      this.money(settlement.total_amount) -
        this.money(settlement.credit_amount) -
        this.money(settlement.allocated_amount),
    );
  }

  private money(value: string | number) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0)
      throw new ConflictException({
        code: 'CONTRACT_SETTLEMENT_MONEY_INVALID',
        message: 'Contract settlement authority contains an invalid money value',
      });
    return parsed;
  }

  private async auditAndEvent(
    client: PoolClient,
    actor: UserAccessContext,
    propertyId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    data: Record<string, unknown>,
    context: RequestAuditContext,
  ) {
    await this.audit.write(
      {
        actorUserId: actor.id,
        propertyId,
        action,
        resourceType,
        resourceId,
        afterData: data,
        resultStatus: 'success',
        ...context,
      },
      client,
    );
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,actor_user_id,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        propertyId,
        `${action}:${resourceId}`,
        action,
        resourceType,
        resourceId,
        context.correlationId ?? null,
        actor.id,
        JSON.stringify(data),
      ],
    );
  }
}
