import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../../infrastructure/database/database.service';

const SCHEDULER_LOCK_NAME = 'granada-lease-settlement-lifecycle-v2';
const AUTOMATIC_INTERVAL_MS = 5 * 60 * 1000;
const AUTOMATIC_START_DELAY_MS = 45 * 1000;

type NotificationKind =
  | 'h_minus_7'
  | 'h_minus_3'
  | 'h_minus_1'
  | 'due_today'
  | 'overdue_h_plus_1'
  | 'grace_ended'
  | 'termination_eligible'
  | 'extension_expiring'
  | 'extension_expired';

type Candidate = {
  property_id: string;
  lease_id: string;
  settlement_id: string;
  checkpoint_id: string;
  checkpoint_code: 'checkpoint_1' | 'checkpoint_2' | 'final_settlement';
  due_date: string;
  extension_due_date: string | null;
  resident_user_id: string | null;
  resident_name: string;
  room_number: string;
  shortfall_amount: string;
  outstanding_amount: string;
};

export type ContractSettlementLifecycleRunResult = {
  run_id: string;
  business_date: string;
  status: 'completed' | 'skipped_advisory_lock';
  properties_considered: number;
  checkpoints_considered: number;
  notifications_created: number;
  transitions_recorded: number;
  failures: number;
};

@Injectable()
export class ContractSettlementLifecycleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractSettlementLifecycleScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.processEnabled()) {
      this.logger.log('Lease settlement lifecycle scheduler is disabled');
      return;
    }
    this.scheduleNext(AUTOMATIC_START_DELAY_MS);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(
    options: { businessDate?: string; runId?: string } = {},
  ): Promise<ContractSettlementLifecycleRunResult> {
    if (options.businessDate && this.environment() !== 'test')
      throw new Error('LEASE_SETTLEMENT_LIFECYCLE_TEST_DATE_OVERRIDE_FORBIDDEN');
    const runId = options.runId ?? `lease-settlement-lifecycle-${randomUUID()}`;
    const dedicatedClient = await this.database.client.connect();
    let acquired = false;
    try {
      const businessDate = options.businessDate ?? (await this.jakartaToday(dedicatedClient));
      const lock = await dedicatedClient.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
        [SCHEDULER_LOCK_NAME],
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired)
        return {
          run_id: runId,
          business_date: businessDate,
          status: 'skipped_advisory_lock',
          properties_considered: 0,
          checkpoints_considered: 0,
          notifications_created: 0,
          transitions_recorded: 0,
          failures: 0,
        };

      const propertyIds = await this.enabledPropertyIds(dedicatedClient);
      const result: ContractSettlementLifecycleRunResult = {
        run_id: runId,
        business_date: businessDate,
        status: 'completed',
        properties_considered: propertyIds.length,
        checkpoints_considered: 0,
        notifications_created: 0,
        transitions_recorded: 0,
        failures: 0,
      };
      for (const propertyId of propertyIds) {
        const candidates = await this.loadCandidates(dedicatedClient, propertyId);
        result.checkpoints_considered += candidates.length;
        for (const candidate of candidates) {
          try {
            const processed = await this.processCandidate(candidate, businessDate, runId);
            result.notifications_created += processed.notifications;
            result.transitions_recorded += processed.transitions;
          } catch (error) {
            result.failures += 1;
            this.logger.error(
              JSON.stringify({
                event: 'lease_settlement_lifecycle_candidate_failed',
                run_id: runId,
                property_id: propertyId,
                lease_id: candidate.lease_id,
                checkpoint_id: candidate.checkpoint_id,
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
      }
      this.logger.log(JSON.stringify({ event: 'lease_settlement_lifecycle_completed', ...result }));
      return result;
    } finally {
      if (acquired) {
        try {
          await dedicatedClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
            SCHEDULER_LOCK_NAME,
          ]);
        } catch {
          // Session loss releases the advisory lock.
        }
      }
      dedicatedClient.release();
    }
  }

  private async processCandidate(candidate: Candidate, businessDate: string, runId: string) {
    return this.database.transaction(async (client) => {
      const current = await this.reloadCandidate(
        client,
        candidate.property_id,
        candidate.checkpoint_id,
      );
      if (!current) return { notifications: 0, transitions: 0 };
      const kinds = this.notificationKinds(current, businessDate);
      let notifications = 0;
      let transitions = 0;
      for (const kind of kinds) {
        transitions += await this.recordTransition(client, current, kind, businessDate, runId);
        const recipients = await this.recipients(client, current, kind);
        for (const recipientUserId of recipients) {
          notifications += await this.insertNotification(
            client,
            current,
            kind,
            recipientUserId,
            businessDate,
            runId,
          );
        }
      }
      return { notifications, transitions };
    });
  }

  private notificationKinds(candidate: Candidate, businessDate: string): NotificationKind[] {
    const dueDelta = this.dayDifference(candidate.due_date, businessDate);
    const kinds: NotificationKind[] = [];
    if (dueDelta === -7) kinds.push('h_minus_7');
    if (dueDelta === -3) kinds.push('h_minus_3');
    if (dueDelta === -1) kinds.push('h_minus_1');
    if (dueDelta === 0) kinds.push('due_today');
    if (dueDelta === 1) kinds.push('overdue_h_plus_1');
    if (candidate.extension_due_date) {
      const extensionDelta = this.dayDifference(candidate.extension_due_date, businessDate);
      if (extensionDelta === -1) kinds.push('extension_expiring');
      if (extensionDelta >= 1) kinds.push('extension_expired');
    } else {
      if (dueDelta >= 4) kinds.push('grace_ended');
      if (dueDelta >= 8) kinds.push('termination_eligible');
    }
    return kinds;
  }

  private async recordTransition(
    client: PoolClient,
    candidate: Candidate,
    kind: NotificationKind,
    businessDate: string,
    runId: string,
  ) {
    const eventTypes =
      kind === 'overdue_h_plus_1'
        ? ['overdue_started', 'grace_started']
        : kind === 'grace_ended'
          ? ['admin_action_required']
          : kind === 'termination_eligible'
            ? ['termination_eligible']
            : kind === 'extension_expiring'
              ? ['extension_expiring']
              : kind === 'extension_expired'
                ? ['extension_expired']
                : [];
    let insertedCount = 0;
    for (const eventType of eventTypes) {
      const eventKey = `${eventType}:${candidate.checkpoint_id}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO lease_settlement_checkpoint_events(
           property_id,lease_id,checkpoint_id,event_type,event_key,metadata
         ) VALUES($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT(property_id,event_key) WHERE event_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          candidate.property_id,
          candidate.lease_id,
          candidate.checkpoint_id,
          eventType,
          eventKey,
          JSON.stringify({
            business_date: businessDate,
            original_due_date: candidate.due_date,
            extension_due_date: candidate.extension_due_date,
            shortfall_amount: this.money(candidate.shortfall_amount),
            run_id: runId,
          }),
        ],
      );
      if (!inserted.rows[0]) continue;
      insertedCount += 1;
      await client.query(
        `INSERT INTO audit_logs(
           property_id,action,resource_type,resource_id,after_data,result_status,correlation_id
         ) VALUES($1,$2,'lease_settlement_checkpoint',$3,$4::jsonb,'success',$5)`,
        [
          candidate.property_id,
          `lease.settlement_${eventType}`,
          candidate.checkpoint_id,
          JSON.stringify({ business_date: businessDate, lease_id: candidate.lease_id }),
          runId,
        ],
      );
      await client.query(
        `INSERT INTO business_events(
           property_id,event_key,event_type,aggregate_type,aggregate_id,correlation_id,payload
         ) VALUES($1,$2,$3,'lease_settlement_checkpoint',$4,$5,$6::jsonb)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          candidate.property_id,
          `lease.settlement_${eventType}:${candidate.checkpoint_id}`,
          `lease.settlement_${eventType}`,
          candidate.checkpoint_id,
          runId,
          JSON.stringify({ lease_id: candidate.lease_id, business_date: businessDate }),
        ],
      );
    }
    return insertedCount;
  }

  private async recipients(client: PoolClient, candidate: Candidate, kind: NotificationKind) {
    const residentOnly = ['h_minus_3', 'h_minus_1', 'due_today'].includes(kind);
    const ids = new Set<string>();
    if (candidate.resident_user_id) ids.add(candidate.resident_user_id);
    if (!residentOnly) {
      const admins = await client.query<{ user_id: string }>(
        `SELECT membership.user_id
           FROM user_property_roles membership
           JOIN roles role ON role.id=membership.role_id AND role.code='admin'
           JOIN users account ON account.id=membership.user_id AND account.user_status='active'
          WHERE membership.property_id=$1 AND membership.revoked_at IS NULL`,
        [candidate.property_id],
      );
      admins.rows.forEach((row) => ids.add(row.user_id));
    }
    return [...ids];
  }

  private async insertNotification(
    client: PoolClient,
    candidate: Candidate,
    kind: NotificationKind,
    recipientUserId: string,
    businessDate: string,
    runId: string,
  ) {
    const ledger = await client.query<{ id: string }>(
      `INSERT INTO lease_settlement_notification_ledger(
         property_id,lease_id,checkpoint_id,notification_kind,recipient_user_id,trigger_business_date
       ) VALUES($1,$2,$3,$4,$5,$6::date)
       ON CONFLICT(checkpoint_id,notification_kind,recipient_user_id) DO NOTHING
       RETURNING id`,
      [
        candidate.property_id,
        candidate.lease_id,
        candidate.checkpoint_id,
        kind,
        recipientUserId,
        businessDate,
      ],
    );
    if (!ledger.rows[0]) return 0;
    const copy = this.notificationCopy(candidate, kind);
    const notification = await client.query<{ id: string }>(
      `INSERT INTO notifications(
         property_id,recipient_user_id,notification_type,priority,title,body,metadata,
         source_event_type,source_resource_id,correlation_id,expires_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,now()+INTERVAL '90 days')
       RETURNING id`,
      [
        candidate.property_id,
        recipientUserId,
        `lease_settlement_${kind}`,
        copy.priority,
        copy.title,
        copy.body,
        JSON.stringify({
          lease_id: candidate.lease_id,
          checkpoint_id: candidate.checkpoint_id,
          checkpoint_code: candidate.checkpoint_code,
          original_due_date: candidate.due_date,
          extension_due_date: candidate.extension_due_date,
          shortfall_amount: this.money(candidate.shortfall_amount),
        }),
        `lease.settlement_${kind}`,
        candidate.checkpoint_id,
        runId,
      ],
    );
    await client.query(
      `UPDATE lease_settlement_notification_ledger SET notification_id=$2 WHERE id=$1`,
      [ledger.rows[0].id, notification.rows[0].id],
    );
    await client.query(
      `INSERT INTO audit_logs(
         property_id,action,resource_type,resource_id,after_data,result_status,correlation_id
       ) VALUES($1,'notification.lease_settlement_created','notification',$2,$3::jsonb,'success',$4)`,
      [
        candidate.property_id,
        notification.rows[0].id,
        JSON.stringify({
          status: 'created',
          notification_kind: kind,
          business_date: businessDate,
          lease_id: candidate.lease_id,
          checkpoint_id: candidate.checkpoint_id,
          original_due_date: candidate.due_date,
          extension_due_date: candidate.extension_due_date,
        }),
        runId,
      ],
    );
    return 1;
  }

  private notificationCopy(candidate: Candidate, kind: NotificationKind) {
    const shortfall = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(this.money(candidate.shortfall_amount));
    const due = candidate.extension_due_date ?? candidate.due_date;
    const copy: Record<
      NotificationKind,
      { priority: 'normal' | 'high' | 'urgent'; title: string; body: string }
    > = {
      h_minus_7: {
        priority: 'normal',
        title: 'Checkpoint pembayaran H-7',
        body: `${candidate.resident_name} memiliki kebutuhan ${shortfall} dengan tenggat ${due}.`,
      },
      h_minus_3: {
        priority: 'normal',
        title: 'Pengingat pembayaran H-3',
        body: `Kekurangan checkpoint Anda ${shortfall}. Tenggat pembayaran ${due}.`,
      },
      h_minus_1: {
        priority: 'high',
        title: 'Pengingat pembayaran H-1',
        body: `Kekurangan checkpoint Anda ${shortfall}. Tenggat pembayaran besok, ${due}.`,
      },
      due_today: {
        priority: 'high',
        title: 'Pembayaran jatuh tempo hari ini',
        body: `Kekurangan checkpoint Anda ${shortfall}. Selesaikan paling lambat ${due} WIB.`,
      },
      overdue_h_plus_1: {
        priority: 'high',
        title: 'Checkpoint pembayaran terlambat',
        body: `Checkpoint ${candidate.resident_name} kurang ${shortfall} dan telah memasuki masa toleransi.`,
      },
      grace_ended: {
        priority: 'urgent',
        title: 'Tindakan Admin diperlukan',
        body: `Masa toleransi ${candidate.resident_name} berakhir. Kekurangan saat ini ${shortfall}.`,
      },
      termination_eligible: {
        priority: 'urgent',
        title: 'Sewa memenuhi syarat tinjauan pemberhentian',
        body: `${candidate.resident_name} masih kurang ${shortfall}. Putusan tetap wajib dilakukan Admin.`,
      },
      extension_expiring: {
        priority: 'high',
        title: 'Perpanjangan berakhir besok',
        body: `Perpanjangan pembayaran ${candidate.resident_name} berakhir pada ${due}; kekurangan ${shortfall}.`,
      },
      extension_expired: {
        priority: 'urgent',
        title: 'Perpanjangan pembayaran berakhir',
        body: `Perpanjangan ${candidate.resident_name} telah berakhir. Kekurangan ${shortfall}; tindakan Admin diperlukan.`,
      },
    };
    return copy[kind];
  }

  private async loadCandidates(client: PoolClient, propertyId: string) {
    const result = await client.query<Candidate>(this.candidateSql(), [propertyId, null]);
    return result.rows;
  }

  private async reloadCandidate(client: PoolClient, propertyId: string, checkpointId: string) {
    await client.query(
      `SELECT settlement.id
         FROM lease_contract_settlements settlement
         JOIN lease_settlement_checkpoints checkpoint ON checkpoint.lease_id=settlement.lease_id
        WHERE settlement.property_id=$1 AND checkpoint.id=$2
        FOR UPDATE OF settlement`,
      [propertyId, checkpointId],
    );
    const result = await client.query<Candidate>(this.candidateSql(), [propertyId, checkpointId]);
    return result.rows[0] ?? null;
  }

  private candidateSql() {
    return `WITH ledger AS (
      SELECT invoice.lease_id,
             COALESCE(sum(invoice.credit_amount + COALESCE(allocation.net,0)),0) AS verified_rent_credit
        FROM invoices invoice
        LEFT JOIN LATERAL (
          SELECT COALESCE(sum(payment_allocation.allocated_amount
                   - COALESCE(reversal.reversed_amount,0)),0) AS net
            FROM payment_allocations payment_allocation
            LEFT JOIN LATERAL (
              SELECT COALESCE(sum(reversal_allocation.reversed_amount),0) AS reversed_amount
                FROM payment_reversal_allocations reversal_allocation
               WHERE reversal_allocation.original_allocation_id=payment_allocation.id
            ) reversal ON true
           WHERE payment_allocation.invoice_id=invoice.id
        ) allocation ON true
       WHERE invoice.property_id=$1
         AND invoice.invoice_purpose='rent'
         AND invoice.authority_source='contract_schedule'
         AND invoice.invoice_status<>'void'
       GROUP BY invoice.lease_id
    ), candidate AS (
      SELECT settlement.property_id,settlement.lease_id,settlement.id AS settlement_id,
             checkpoint.id AS checkpoint_id,checkpoint.checkpoint_code,
             (checkpoint.due_at AT TIME ZONE 'Asia/Jakarta')::date::text AS due_date,
             (extension.extension_due_at AT TIME ZONE 'Asia/Jakarta')::date::text AS extension_due_date,
             CASE WHEN resident_account.user_status='active' THEN resident.user_id END AS resident_user_id,
             resident.full_name AS resident_name,
             room.number AS room_number,
             GREATEST(lease.contract_rent_amount-COALESCE(ledger.verified_rent_credit,0),0) AS outstanding_amount,
             CASE WHEN checkpoint.settlement_mode='exact_remaining_balance'
                  THEN GREATEST(lease.contract_rent_amount-COALESCE(ledger.verified_rent_credit,0),0)
                  ELSE GREATEST(checkpoint.minimum_required_amount-COALESCE(ledger.verified_rent_credit,0),0)
             END AS shortfall_amount,
             checkpoint.checkpoint_sequence,
             row_number() OVER(PARTITION BY settlement.lease_id ORDER BY checkpoint.checkpoint_sequence) AS authority_rank
        FROM lease_contract_settlements settlement
        JOIN leases lease ON lease.id=settlement.lease_id AND lease.property_id=settlement.property_id
        JOIN residents resident ON resident.id=lease.resident_id AND resident.property_id=lease.property_id
        LEFT JOIN users resident_account ON resident_account.id=resident.user_id
        JOIN rooms room ON room.id=lease.room_id AND room.property_id=lease.property_id
        JOIN lease_settlement_checkpoints checkpoint
          ON checkpoint.lease_id=settlement.lease_id
         AND checkpoint.property_id=settlement.property_id
         AND checkpoint.policy_snapshot_id=settlement.policy_snapshot_id
        LEFT JOIN ledger ON ledger.lease_id=settlement.lease_id
        LEFT JOIN lease_settlement_extensions extension
          ON extension.checkpoint_id=checkpoint.id AND extension.property_id=checkpoint.property_id
       WHERE settlement.property_id=$1
         AND settlement.policy_snapshot_id IS NOT NULL
         AND settlement.state='open'
         AND lease.lease_status='active'
         AND ($2::uuid IS NULL OR checkpoint.id=$2)
         AND NOT EXISTS(
           SELECT 1 FROM lease_termination_cases termination
            WHERE termination.settlement_id=settlement.id AND termination.status='pending'
         )
    ), unresolved AS (
      SELECT *,row_number() OVER(PARTITION BY lease_id ORDER BY checkpoint_sequence) AS unresolved_rank
        FROM candidate
       WHERE shortfall_amount>0
    )
    SELECT property_id,lease_id,settlement_id,checkpoint_id,checkpoint_code,due_date,
           extension_due_date,resident_user_id,resident_name,room_number,
           shortfall_amount,outstanding_amount
      FROM unresolved
     WHERE unresolved_rank=1
     ORDER BY due_date,lease_id`;
  }

  private async enabledPropertyIds(client: PoolClient) {
    const result = await client.query<{ property_id: string }>(
      `SELECT property_id FROM property_feature_flags
        WHERE admin_ux_read=true AND lease_write=true AND lease_settlement_scheduler=true
        ORDER BY property_id`,
    );
    return result.rows.map((row) => row.property_id);
  }

  private async jakartaToday(client: PoolClient) {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  private dayDifference(fromDate: string, toDate: string) {
    return (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
  }

  private money(value: string) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0)
      throw new Error('LEASE_SETTLEMENT_MONEY_INVALID');
    return parsed;
  }

  private environment() {
    return this.config.get<string>('app.env') ?? process.env.NODE_ENV ?? 'development';
  }

  private processEnabled() {
    return this.config.get<boolean>('lease.settlementSchedulerProcessEnabled') === true;
  }

  private scheduleNext(delayMs: number) {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) =>
          this.logger.error(
            JSON.stringify({
              event: 'lease_settlement_lifecycle_run_failed',
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        )
        .finally(() => this.scheduleNext(AUTOMATIC_INTERVAL_MS));
    }, delayMs);
    this.timer.unref?.();
  }
}
