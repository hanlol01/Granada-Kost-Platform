import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  buildContractSchedule,
  type ContractPaymentPlan,
} from '../billing/helpers/contract-schedule.helper';
import {
  buildLeaseSettlementPolicySchedule,
  buildLeaseSettlementPolicyScheduleV3,
  buildLeaseSettlementPolicyScheduleV4,
} from '../billing/helpers/lease-settlement-policy.helper';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { ConfirmLeaseCheckInDto } from './dto/confirm-lease-check-in.dto';
import { buildServicePeriod } from './lease-service-period.helper';

type PeriodLease = {
  id: string;
  property_id: string;
  room_id: string;
  resident_id: string;
  start_date: string;
  end_date: string;
  planned_start_date: string;
  service_period_state: string;
  lease_status: string;
  occupancy_id: string | null;
  term_months: number;
  payment_plan_type: ContractPaymentPlan;
  snapshot_monthly_price: string;
  contract_rent_amount: string;
  commercial_mode: string;
};

@Injectable()
export class LeaseServicePeriodService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
  ) {}

  async preview(actor: UserAccessContext, leaseId: string, dto: ConfirmLeaseCheckInDto) {
    await this.properties.assertCanReadProperty(actor, dto.property_id);
    return this.database.transaction(async (client) => {
      const lease = await this.load(client, leaseId, dto.property_id);
      const date = await this.chosenDate(client, dto.checked_in_at ?? null);
      const period = buildServicePeriod(date.business_date, Number(lease.term_months));
      await this.assertAvailable(client, lease, period.startDate!, period.endDate!);
      const facts = await client.query<{ received: string; document_count: string }>(
        `SELECT (SELECT COALESCE(sum(payment.amount),0) FROM payments payment
                  WHERE payment.lease_id=$1 AND payment.property_id=$2 AND payment.payment_status='verified'
                    AND payment.payment_purpose<>'security_deposit'
                    AND NOT EXISTS(SELECT 1 FROM payment_reversals reversal WHERE reversal.payment_id=payment.id))::text AS received,
                ((SELECT count(*) FROM payment_receipts receipt JOIN payments payment ON payment.id=receipt.payment_id
                   WHERE payment.lease_id=$1 AND payment.property_id=$2)
                 +(SELECT count(*) FROM invoices WHERE lease_id=$1 AND property_id=$2 AND issued_at IS NOT NULL))::text AS document_count`,
        [leaseId, dto.property_id],
      );
      return {
        data: {
          plannedStartDate: lease.planned_start_date,
          ...period,
          termMonths: Number(lease.term_months),
          contractRentAmount: Number(lease.contract_rent_amount),
          verifiedPaymentAmount: Number(facts.rows[0].received),
          documentCount: Number(facts.rows[0].document_count),
          reasonRequired:
            date.business_date !== lease.planned_start_date || date.business_date !== date.today,
        },
      };
    });
  }

  async history(actor: UserAccessContext, leaseId: string, propertyId: string) {
    await this.properties.assertCanReadProperty(actor, propertyId);
    const result = await this.database.client.query(
      `SELECT version.id,version.sequence_number,version.source,version.previous_snapshot,version.effective_snapshot,
              version.checked_in_at,version.reason,version.created_at,actor.display_name AS created_by_name
         FROM lease_service_period_versions version LEFT JOIN users actor ON actor.id=version.created_by_user_id
        WHERE version.lease_id=$1 AND version.property_id=$2 ORDER BY version.sequence_number DESC`,
      [leaseId, propertyId],
    );
    return { data: result.rows };
  }

  async validateAmendmentLocked(
    client: PoolClient,
    leaseId: string,
    propertyId: string,
    checkedInDate: string,
  ) {
    const lease = await this.load(client, leaseId, propertyId);
    const date = await this.chosenDate(client, `${checkedInDate}T00:00:00+07:00`);
    const period = buildServicePeriod(date.business_date, Number(lease.term_months));
    await this.assertAvailable(
      client,
      lease,
      period.startDate!,
      period.endDate!,
      'lease_data_correction',
    );
  }

  /** Caller owns the check-in transaction, advisory lock, and idempotency claim. */
  async finalizeLocked(
    client: PoolClient,
    input: {
      leaseId: string;
      propertyId: string;
      checkedInAt: Date;
      actorId: string;
      reason?: string;
      commandFingerprint: string;
      source?: 'physical_check_in' | 'lease_data_correction';
    },
  ) {
    const lease = await this.load(client, input.leaseId, input.propertyId);
    const date = await this.chosenDate(client, input.checkedInAt.toISOString());
    const period = buildServicePeriod(date.business_date, Number(lease.term_months));
    await this.assertAvailable(client, lease, period.startDate!, period.endDate!, input.source);
    const reason = input.reason?.trim();
    if (
      (date.business_date !== lease.planned_start_date || date.business_date !== date.today) &&
      (!reason || reason.length < 3)
    )
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_REASON_REQUIRED',
        message:
          'Tanggal check-in berbeda dari rencana atau dicatat mundur. Isi alasan pencatatan sebelum melanjutkan.',
      });

    const oldSchedule = await client.query<{
      id: string;
      invoice_id: string;
      sequence_number: number;
      coverage_start_date: string;
      coverage_end_date: string;
      due_date: string;
      scheduled_amount: string;
    }>(
      `SELECT id,invoice_id,sequence_number,coverage_start_date::text,coverage_end_date::text,due_date::text,scheduled_amount
          FROM lease_installments WHERE lease_id=$1 AND property_id=$2 ORDER BY sequence_number FOR UPDATE`,
      [lease.id, lease.property_id],
    );
    const schedule =
      lease.commercial_mode === 'owner_sponsored'
        ? []
        : buildContractSchedule({
            startDate: period.startDate!,
            termMonths: Number(lease.term_months),
            paymentPlanType: lease.payment_plan_type,
            contractRentAmount: Number(lease.contract_rent_amount),
          });
    if (
      schedule.length !== oldSchedule.rows.length ||
      schedule.some(
        (item, index) => item.scheduledAmount !== Number(oldSchedule.rows[index]?.scheduled_amount),
      )
    )
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED',
        message:
          'Jadwal tagihan belum cocok dengan nilai kontrak. Tinjau tagihan penyewaan sebelum mengesahkan check-in; pembayaran tetap tersimpan.',
      });

    const settlement = await client.query<{
      id: string;
      state: string;
      policy_snapshot_id: string | null;
      policy_version: string | null;
    }>(
      `SELECT settlement.id,settlement.state,settlement.policy_snapshot_id,policy.policy_version
         FROM lease_contract_settlements settlement
         LEFT JOIN lease_settlement_policy_snapshots policy ON policy.id=settlement.policy_snapshot_id
        WHERE settlement.lease_id=$1 AND settlement.property_id=$2 FOR UPDATE OF settlement`,
      [lease.id, lease.property_id],
    );
    const previousSchedule = await client.query(
      `SELECT id,invoice_id,sequence_number,coverage_start_date::text,
      coverage_end_date::text,due_date::text,scheduled_amount FROM lease_installment_effective_periods
      WHERE lease_id=$1 AND property_id=$2 ORDER BY sequence_number`,
      [lease.id, lease.property_id],
    );
    const previous = {
      startDate: lease.start_date,
      endDate: lease.end_date,
      servicePeriodPending: lease.service_period_state === 'pending_check_in',
      plannedStartDate: lease.planned_start_date,
      termMonths: Number(lease.term_months),
      contractRentAmount: Number(lease.contract_rent_amount),
      policySnapshotId: settlement.rows[0]?.policy_snapshot_id ?? null,
      schedule: previousSchedule.rows,
    };
    const policyId = settlement.rows[0]
      ? await this.rebasePolicy(
          client,
          lease,
          period.startDate!,
          date.checked_in_at,
          input.actorId,
          settlement.rows[0],
          input.source ?? 'physical_check_in',
        )
      : null;
    const version = await client.query<{ id: string; sequence_number: number }>(
      `INSERT INTO lease_service_period_versions(property_id,lease_id,sequence_number,source,previous_snapshot,effective_snapshot,
           checked_in_at,reason,created_by_user_id,command_fingerprint)
       SELECT $1,$2,COALESCE(max(sequence_number),0)+1,$9,$3::jsonb,$4::jsonb,$5,$6,$7,$8
         FROM lease_service_period_versions WHERE lease_id=$2 RETURNING id,sequence_number`,
      [
        lease.property_id,
        lease.id,
        JSON.stringify(previous),
        JSON.stringify({
          ...period,
          termMonths: Number(lease.term_months),
          contractRentAmount: Number(lease.contract_rent_amount),
          policySnapshotId: policyId,
          schedule,
        }),
        date.checked_in_at,
        reason || 'Periode sewa ditetapkan saat check-in fisik',
        input.actorId,
        input.commandFingerprint,
        input.source ?? 'physical_check_in',
      ],
    );
    for (const [index, item] of schedule.entries()) {
      await client.query(
        `INSERT INTO lease_service_period_installments(version_id,installment_id,coverage_start_date,coverage_end_date,due_date)
        VALUES($1,$2,$3::date,$4::date,$5::date)`,
        [
          version.rows[0].id,
          oldSchedule.rows[index].id,
          item.coverageStartDate,
          item.coverageEndDate,
          item.dueDate,
        ],
      );
    }
    const updated = await client.query(
      `UPDATE leases SET start_date=$3::date,end_date=$4::date,service_period_state='started',updated_at=now()
                        WHERE id=$1 AND property_id=$2 AND service_period_state=$5`,
      [lease.id, lease.property_id, period.startDate, period.endDate, lease.service_period_state],
    );
    if (updated.rowCount !== 1)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_WRITE_CONFLICT',
        message:
          'Data penyewaan berubah saat check-in diproses. Muat ulang dan tinjau tanggal check-in; tidak ada perubahan yang disimpan.',
      });
    return {
      ...period,
      versionId: version.rows[0].id,
      sequenceNumber: version.rows[0].sequence_number,
    };
  }

  private async load(client: PoolClient, leaseId: string, propertyId: string) {
    const result = await client.query<PeriodLease>(
      `SELECT id,property_id,room_id,resident_id,start_date::text,end_date::text,planned_start_date::text,
              service_period_state,lease_status,occupancy_id,term_months,payment_plan_type,
              snapshot_monthly_price,contract_rent_amount,commercial_mode
         FROM leases WHERE id=$1 AND property_id=$2 FOR UPDATE`,
      [leaseId, propertyId],
    );
    const lease = result.rows[0];
    if (!lease)
      throw new NotFoundException({
        code: 'LEASE_NOT_FOUND',
        message: 'Penyewaan tidak ditemukan pada properti ini.',
      });
    const term = Number(lease.term_months);
    const contractRent = Number(lease.contract_rent_amount);
    const monthlyRent = Number(lease.snapshot_monthly_price);
    if (
      !Number.isSafeInteger(term) ||
      term < 1 ||
      term > 120 ||
      (lease.commercial_mode !== 'owner_sponsored' &&
        !['annual_full', 'monthly_installments', 'two_month_installments'].includes(
          lease.payment_plan_type,
        )) ||
      (lease.payment_plan_type === 'two_month_installments' && term % 2 !== 0) ||
      !Number.isSafeInteger(contractRent) ||
      contractRent < 0 ||
      (lease.commercial_mode !== 'owner_sponsored' &&
        (!Number.isSafeInteger(monthlyRent) || monthlyRent <= 0 || contractRent <= 0))
    ) {
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_LEGACY_REVIEW_REQUIRED',
        message:
          'Durasi, tarif, atau jadwal tagihan penyewaan lama belum lengkap. Tinjau data kontrak melalui Koreksi Data Penyewaan sebelum check-in; pembayaran yang sudah tercatat tidak berubah.',
      });
    }
    return lease;
  }

  private async chosenDate(client: PoolClient, checkedInAt: string | null) {
    const result = await client.query<{
      checked_in_at: Date;
      business_date: string;
      today: string;
      valid: boolean;
    }>(
      `WITH chosen AS (SELECT COALESCE($1::timestamptz,now()) AS checked_in_at)
       SELECT checked_in_at,(checked_in_at AT TIME ZONE 'Asia/Jakarta')::date::text AS business_date,
              (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today,checked_in_at<=now() AS valid FROM chosen`,
      [checkedInAt],
    );
    if (!result.rows[0]?.valid)
      throw new ConflictException({
        code: 'LEASE_CHECK_IN_TIME_INVALID',
        message:
          'Check-in fisik belum dapat dicatat untuk tanggal mendatang. Pilih tanggal penghuni benar-benar menerima kamar.',
      });
    return result.rows[0];
  }

  private async assertAvailable(
    client: PoolClient,
    lease: PeriodLease,
    start: string,
    end: string,
    source: 'physical_check_in' | 'lease_data_correction' = 'physical_check_in',
  ) {
    const available =
      source === 'physical_check_in'
        ? lease.service_period_state === 'pending_check_in' &&
          !lease.occupancy_id &&
          ['awaiting_activation', 'active'].includes(lease.lease_status)
        : !!lease.occupancy_id && lease.lease_status === 'active';
    if (!available)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_ALREADY_STARTED',
        message:
          'Periode sewa sudah ditetapkan atau penyewaan tidak menunggu check-in. Gunakan Koreksi Data Penyewaan untuk perubahan yang telah tercatat.',
      });
    const conflict = await client.query<{
      room_conflict: boolean;
      financial_lock: boolean;
      checkout: boolean;
      deadline_override: boolean;
    }>(
      `SELECT EXISTS(SELECT 1 FROM leases other WHERE other.property_id=$1 AND other.room_id=$2 AND other.id<>$3
                       AND other.lease_status IN ('awaiting_activation','active')
                       AND daterange(other.start_date,other.end_date,'[)') && daterange($4::date,$5::date,'[)'))
                OR EXISTS(SELECT 1 FROM occupancies occupancy WHERE occupancy.property_id=$1 AND occupancy.room_id=$2
                       AND occupancy.occupancy_status<>'cancelled'
                       AND occupancy.id IS DISTINCT FROM $6::uuid
                       AND occupancy.start_date<$5::date AND COALESCE(occupancy.end_date,'infinity'::date)>$4::date) AS room_conflict,
              EXISTS(SELECT 1 FROM property_owner_realization_lease_locks WHERE lease_id=$3 AND lock_status='locked') AS financial_lock,
              EXISTS(SELECT 1 FROM lease_checkout_commands WHERE lease_id=$3 AND property_id=$1 AND state<>'cancelled') AS checkout,
              EXISTS(SELECT 1 FROM lease_contract_settlements WHERE lease_id=$3 AND property_id=$1 AND extension_due_at IS NOT NULL)
                OR EXISTS(SELECT 1 FROM lease_settlement_checkpoint_due_date_overrides override
                  JOIN lease_settlement_checkpoints checkpoint ON checkpoint.id=override.checkpoint_id AND checkpoint.property_id=override.property_id
                  JOIN lease_contract_settlements settlement ON settlement.policy_snapshot_id=checkpoint.policy_snapshot_id
                   WHERE settlement.lease_id=$3 AND settlement.property_id=$1
                     AND override.reason NOT IN ('uniform_rent_due_day_adoption','contract_final_deadline_policy_correction')) AS deadline_override`,
      [lease.property_id, lease.room_id, lease.id, start, end, lease.occupancy_id],
    );
    if (conflict.rows[0]?.room_conflict)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_ROOM_CONFLICT',
        message:
          'Kamar sudah digunakan atau dijadwalkan untuk penyewaan lain pada periode baru. Tinjau tanggal check-in dan jadwal kamar.',
      });
    if (conflict.rows[0]?.financial_lock || conflict.rows[0]?.checkout)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_REVIEW_REQUIRED',
        message:
          'Penyewaan sudah terkait realisasi Owner atau proses check-out. Tinjau catatan tersebut melalui Koreksi Data Penyewaan sebelum mengubah periode.',
      });
    if (conflict.rows[0]?.deadline_override)
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_DEADLINE_REVIEW_REQUIRED',
        message:
          'Penyewaan memiliki batas pembayaran khusus. Tinjau pengaturan tersebut sebelum mengubah periode check-in; pembayaran dan dokumen lama tetap tersimpan.',
      });
  }

  private async rebasePolicy(
    client: PoolClient,
    lease: PeriodLease,
    start: string,
    checkedInAt: Date,
    actorId: string,
    settlement: {
      id: string;
      state: string;
      policy_snapshot_id: string | null;
      policy_version: string | null;
    },
    source: 'physical_check_in' | 'lease_data_correction',
  ) {
    if (
      !Number.isSafeInteger(Number(lease.snapshot_monthly_price)) ||
      Number(lease.snapshot_monthly_price) <= 0 ||
      (settlement.policy_version != null &&
        !['lease_settlement_v2', 'lease_settlement_v3', 'lease_settlement_v4'].includes(
          settlement.policy_version,
        ))
    )
      throw new ConflictException({
        code: 'LEASE_SERVICE_PERIOD_BILLING_RECONCILIATION_REQUIRED',
        message:
          'Kebijakan pelunasan atau tarif penyewaan belum dapat diselaraskan. Tinjau tagihan dan ketentuan kontrak sebelum check-in; pembayaran tetap tersimpan.',
      });
    const input = {
      leaseStartDate: start,
      termMonths: Number(lease.term_months),
      monthlyRentAmount: Number(lease.snapshot_monthly_price),
    };
    const policy =
      settlement.policy_version === 'lease_settlement_v2'
        ? buildLeaseSettlementPolicySchedule(input)
        : settlement.policy_version === 'lease_settlement_v3'
          ? buildLeaseSettlementPolicyScheduleV3(input)
          : buildLeaseSettlementPolicyScheduleV4(input);
    const id = randomUUID();
    await client.query(
      `INSERT INTO lease_settlement_policy_snapshots(id,property_id,lease_id,policy_version,term_months,checkpoint_anchor_day,
      monthly_rent_amount,initial_month_minimum_amount,final_settlement_offset_months,grace_period_days,maximum_extension_days,early_termination_notice_days,created_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,3,14,14,$10)`,
      [
        id,
        lease.property_id,
        lease.id,
        policy.policyVersion,
        lease.term_months,
        policy.checkpointAnchorDay,
        lease.snapshot_monthly_price,
        policy.initialMonthMinimumAmount,
        policy.finalSettlementOffsetMonths,
        actorId,
      ],
    );
    for (const cp of policy.checkpoints) {
      const cpId = randomUUID();
      await client.query(
        `INSERT INTO lease_settlement_checkpoints(id,property_id,lease_id,policy_snapshot_id,checkpoint_code,
        checkpoint_sequence,settlement_mode,due_at,minimum_required_amount)
        VALUES($1,$2,$3,$4,$5,$6,$7,(($8::date+INTERVAL '1 day'-INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta'),$9)`,
        [
          cpId,
          lease.property_id,
          lease.id,
          id,
          cp.code,
          cp.sequence,
          cp.settlementMode,
          cp.dueDate,
          cp.minimumRequiredAmount,
        ],
      );
      await client.query(
        `INSERT INTO lease_settlement_checkpoint_events(property_id,lease_id,checkpoint_id,event_type,actor_user_id,metadata)
        VALUES($1,$2,$3,'scheduled',$4,$5::jsonb)`,
        [
          lease.property_id,
          lease.id,
          cpId,
          actorId,
          JSON.stringify({ source, previous_policy_snapshot_id: settlement.policy_snapshot_id }),
        ],
      );
    }
    const final = policy.checkpoints.find((cp) => cp.code === 'final_settlement')!;
    await client.query(
      `UPDATE lease_contract_settlements SET policy_snapshot_id=$3,
      state=CASE WHEN state='paid' THEN 'paid' ELSE 'open' END,activated_at=$4,
      original_due_at=(($5::date+INTERVAL '1 day'-INTERVAL '1 microsecond') AT TIME ZONE 'Asia/Jakarta'),
      extension_due_at=NULL,updated_at=now() WHERE id=$1 AND property_id=$2`,
      [settlement.id, lease.property_id, id, checkedInAt, final.dueDate],
    );
    return id;
  }
}
