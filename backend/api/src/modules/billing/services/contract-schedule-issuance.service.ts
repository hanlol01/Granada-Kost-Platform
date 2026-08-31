import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  buildContractSchedule,
  type ContractPaymentPlan,
} from '../helpers/contract-schedule.helper';
import {
  buildLeaseSettlementPolicySchedule,
  SUPPORTED_LEASE_SETTLEMENT_TERMS,
} from '../helpers/lease-settlement-policy.helper';

/**
 * Canonical, transactional W05/W06 contract-schedule issuance authority.
 *
 * This is the single place that turns an immutable commercial snapshot into the
 * durable installment/invoice/line-item ledger plus the awaiting-activation
 * contract settlement. W05 onboarding and W07C renewal both call it so no
 * caller keeps its own duplicate invoice/installment/line-item lifecycle SQL.
 * It never records or verifies payments (W06 keeps that authority) and never
 * activates the lease or settlement (activation authority keeps that).
 */
export type ContractScheduleIssuanceInput = {
  propertyId: string;
  leaseId: string;
  /** Snapshot-derived rent contract; identical semantics to onboarding. */
  startDate: string;
  termMonths: number;
  paymentPlanType: ContractPaymentPlan;
  contractRentAmount: number;
  billingCycle: 'monthly' | 'yearly';
  snapshotMonthlyPrice: number;
  snapshotRoomNumber: string;
  snapshotBuildingCode: string | null;
  snapshotCategoryName: string;
  /**
   * Already-recorded verified/pending initial rent credit. Only the first
   * installment plus any further installments needed to receive this credit are
   * issued; the rest stay scheduled. Renewal passes 0 and issues only the first.
   */
  initialRentCredit: number;
  /** Optional stable idempotency namespace for the issued invoices. */
  commandFingerprintPrefix?: string;
  actorUserId: string;
};

export type ContractScheduleIssuanceResult = {
  firstInvoiceId: string;
  installmentCount: number;
};

@Injectable()
export class ContractScheduleIssuanceService {
  /**
   * Issues the full snapshot-derived installment/invoice/line-item schedule and
   * creates the awaiting-activation contract settlement inside the caller's
   * transaction. The caller owns commit/rollback so a transient failure leaves
   * zero partial rows.
   */
  async issueScheduleInTransaction(
    client: PoolClient,
    input: ContractScheduleIssuanceInput,
  ): Promise<ContractScheduleIssuanceResult> {
    if (!SUPPORTED_LEASE_SETTLEMENT_TERMS.includes(input.termMonths as 3 | 6 | 12))
      throw new UnprocessableEntityException({
        code: 'LEASE_SETTLEMENT_TERM_NOT_SUPPORTED',
        message: 'New lease settlement supports only 3, 6, or 12 month terms',
      });
    const schedule = buildContractSchedule({
      startDate: input.startDate,
      termMonths: input.termMonths,
      paymentPlanType: input.paymentPlanType,
      contractRentAmount: input.contractRentAmount,
    });
    let firstInvoiceId: string | null = null;
    let remainingInitialRentCredit = Math.max(0, input.initialRentCredit);
    for (const item of schedule) {
      const issueNow = item.sequenceNumber === 1 || remainingInitialRentCredit > 0;
      const installmentStatus = issueNow ? 'issued' : 'scheduled';
      const installmentId = randomUUID();
      await client.query(
        `INSERT INTO lease_installments(id,property_id,lease_id,sequence_number,coverage_start_date,coverage_end_date,due_date,scheduled_amount,installment_status)
         VALUES($1,$2,$3,$4,$5::date,$6::date,$7::date,$8,$9)`,
        [
          installmentId,
          input.propertyId,
          input.leaseId,
          item.sequenceNumber,
          item.coverageStartDate,
          item.coverageEndDate,
          item.dueDate,
          item.scheduledAmount,
          installmentStatus,
        ],
      );
      const invoiceId = randomUUID();
      const commandFingerprint = input.commandFingerprintPrefix
        ? `${input.commandFingerprintPrefix}:installment:${item.sequenceNumber}`
        : null;
      await client.query(
        `INSERT INTO invoices(
           id,property_id,resident_id,room_id,occupancy_id,billing_period_id,lease_id,installment_id,
           invoice_code,invoice_status,subtotal_amount,total_amount,due_date,issued_at,
           snapshot_period_key,snapshot_period_start_date,snapshot_period_end_date,
           snapshot_room_number,snapshot_resident_name,snapshot_monthly_price,
           cycle_start_date,cycle_end_date,snapshot_billing_cycle,snapshot_rent_amount,
           generation_source,invoice_purpose,authority_source,snapshot_building_code,
           snapshot_category_name,snapshot_contract_rent_amount,snapshot_payment_plan_type,
           command_fingerprint,created_by_user_id
         ) SELECT
           $1,$2,l.resident_id,l.room_id,NULL,NULL,l.id,$3,
           $4,$5,$6,$6,$7::date,CASE WHEN $5='issued' THEN now() ELSE NULL END,
           $8,$9::date,$10::date,$11,r.full_name,$12,
           $9::date,$10::date,$13,$6,'auto','rent','contract_schedule',$14,
           $15,$16,$17,$18,$19
         FROM leases l JOIN residents r ON r.id=l.resident_id
         WHERE l.id=$20 AND l.property_id=$2`,
        [
          invoiceId,
          input.propertyId,
          installmentId,
          `RENT-${input.leaseId.slice(0, 8).toUpperCase()}-${String(item.sequenceNumber).padStart(2, '0')}`,
          installmentStatus === 'issued' ? 'issued' : 'draft',
          item.scheduledAmount,
          item.dueDate,
          `LEASE-${input.leaseId}-${item.sequenceNumber}`,
          item.coverageStartDate,
          item.coverageEndDate,
          input.snapshotRoomNumber,
          input.snapshotMonthlyPrice,
          input.billingCycle,
          input.snapshotBuildingCode,
          input.snapshotCategoryName,
          input.contractRentAmount,
          input.paymentPlanType,
          commandFingerprint,
          input.actorUserId,
          input.leaseId,
        ],
      );
      await client.query(
        `INSERT INTO invoice_line_items(invoice_id,line_type,description,quantity,unit_amount,total_amount,sort_order,metadata)
         VALUES($1,'rent',$2,1,$3,$3,0,$4::jsonb)`,
        [
          invoiceId,
          `Sewa ${item.coverageStartDate} s.d. ${item.coverageEndDate}`,
          item.scheduledAmount,
          JSON.stringify({ lease_id: input.leaseId, installment_id: installmentId }),
        ],
      );
      await client.query(
        `UPDATE lease_installments SET invoice_id=$2 WHERE id=$1 AND lease_id=$3`,
        [installmentId, invoiceId, input.leaseId],
      );
      if (item.sequenceNumber === 1) firstInvoiceId = invoiceId;
      remainingInitialRentCredit = Math.max(0, remainingInitialRentCredit - item.scheduledAmount);
    }
    if (!firstInvoiceId)
      throw new ConflictException({
        code: 'CONTRACT_SCHEDULE_FIRST_INVOICE_MISSING',
        message: 'Initial rent invoice could not be issued',
      });
    const settlementPolicy = buildLeaseSettlementPolicySchedule({
      leaseStartDate: input.startDate,
      termMonths: input.termMonths,
      monthlyRentAmount: input.snapshotMonthlyPrice,
    });
    const policySnapshotId = randomUUID();
    await client.query(
      `INSERT INTO lease_settlement_policy_snapshots(
         id,property_id,lease_id,policy_version,term_months,checkpoint_anchor_day,
         monthly_rent_amount,initial_month_minimum_amount,final_settlement_offset_months,
         grace_period_days,maximum_extension_days,early_termination_notice_days,created_by_user_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,3,14,14,$10)`,
      [
        policySnapshotId,
        input.propertyId,
        input.leaseId,
        settlementPolicy.policyVersion,
        input.termMonths,
        settlementPolicy.checkpointAnchorDay,
        input.snapshotMonthlyPrice,
        settlementPolicy.initialMonthMinimumAmount,
        settlementPolicy.finalSettlementOffsetMonths,
        input.actorUserId,
      ],
    );
    for (const checkpoint of settlementPolicy.checkpoints) {
      const checkpointId = randomUUID();
      await client.query(
        `INSERT INTO lease_settlement_checkpoints(
           id,property_id,lease_id,policy_snapshot_id,checkpoint_code,checkpoint_sequence,
           settlement_mode,due_at,minimum_required_amount
         ) VALUES(
           $1,$2,$3,$4,$5,$6,$7,
           (($8::date + INTERVAL '1 day' - INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta'),
           $9
         )`,
        [
          checkpointId,
          input.propertyId,
          input.leaseId,
          policySnapshotId,
          checkpoint.code,
          checkpoint.sequence,
          checkpoint.settlementMode,
          checkpoint.dueDate,
          checkpoint.minimumRequiredAmount,
        ],
      );
      await client.query(
        `INSERT INTO lease_settlement_checkpoint_events(
           property_id,lease_id,checkpoint_id,event_type,actor_user_id,metadata
         ) VALUES($1,$2,$3,'scheduled',$4,$5::jsonb)`,
        [
          input.propertyId,
          input.leaseId,
          checkpointId,
          input.actorUserId,
          JSON.stringify({
            policy_version: settlementPolicy.policyVersion,
            checkpoint_code: checkpoint.code,
            due_date: checkpoint.dueDate,
            settlement_mode: checkpoint.settlementMode,
            minimum_required_amount: checkpoint.minimumRequiredAmount,
          }),
        ],
      );
    }
    // The due date is deliberately assigned only at activation. A committed or
    // approved schedule is not an occupancy. The v2 checkpoints retain their
    // commercial date anchor, while their actionable status is projected only
    // after the lease becomes active.
    await client.query(
      `INSERT INTO lease_contract_settlements(
         property_id,lease_id,invoice_id,state,policy_snapshot_id
       ) VALUES($1,$2,$3,'awaiting_activation',$4)`,
      [input.propertyId, input.leaseId, firstInvoiceId, policySnapshotId],
    );
    await client.query(
      `INSERT INTO lease_activation_lifecycles(
         property_id,lease_id,state,cutoff_at,check_in_due_at
       ) VALUES(
         $1,$2,'scheduled',
         (($3::date + TIME '00:05') AT TIME ZONE 'Asia/Jakarta'),
         (($3::date + 1 + TIME '00:05') AT TIME ZONE 'Asia/Jakarta')
       )`,
      [input.propertyId, input.leaseId, input.startDate],
    );
    return { firstInvoiceId, installmentCount: schedule.length };
  }
}
