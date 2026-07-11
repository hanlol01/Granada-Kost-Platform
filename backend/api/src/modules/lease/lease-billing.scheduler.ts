import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { dueDateWithinCycle, nextBillingStart, previousDate } from './lease-date.helper';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRepository } from './lease.repository';
import type { BillingCycle } from './lease.types';

const MAX_CATCH_UP_CYCLES = 12;
const SCHEDULER_LOCK_NAME = 'granada-lease-billing-v1';
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

type SchedulerPropertyRow = {
  id: string;
  default_due_day: number | null;
};

type SchedulerLeaseRow = {
  id: string;
  property_id: string;
  lease_code: string;
  resident_id: string;
  room_id: string;
  occupancy_id: string;
  lease_status: string;
  billing_cycle: BillingCycle;
  billing_anchor_day: number;
  next_billing_date: string;
  snapshot_monthly_price: string;
  snapshot_yearly_price: string;
  snapshot_room_number: string;
};

type SchedulerResidentRow = {
  id: string;
  property_id: string;
  full_name: string;
  resident_status: string;
};
type SchedulerRoomRow = { id: string; property_id: string; room_status: string };
type SchedulerOccupancyRow = {
  id: string;
  property_id: string;
  room_id: string;
  resident_id: string;
  occupancy_status: string;
};

type ProcessResult =
  | { state: 'none' }
  | {
      state: 'processed';
      leaseId: string;
      cyclesAdvanced: number;
      invoicesIssued: number;
      catchUpLimited: boolean;
    }
  | { state: 'failed'; leaseId: string | null };

export type LeaseBillingRunResult = {
  run_id: string;
  business_date: string;
  status: 'completed' | 'skipped_advisory_lock';
  properties_considered: number;
  leases_processed: number;
  leases_failed: number;
  cycles_advanced: number;
  invoices_issued: number;
  catch_up_limited: number;
};

/**
 * A native timer intentionally avoids a scheduler dependency and remains off
 * unless both an explicit process switch and a per-property canary are true.
 * The timer merely invokes runOnce; all billing writes still use PostgreSQL.
 */
@Injectable()
export class LeaseBillingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaseBillingScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.automaticProcessEnabled()) {
      this.logger.log('Lease billing scheduler automatic process is disabled');
      return;
    }
    this.scheduleNextAutomaticRun();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * An internal/test hook. There is intentionally no HTTP endpoint for this
   * method. businessDate overrides are accepted only under NODE_ENV=test so a
   * deployed scheduler cannot be asked to issue future invoices.
   */
  async runOnce(
    options: { businessDate?: string; runId?: string } = {},
  ): Promise<LeaseBillingRunResult> {
    if (options.businessDate && this.environment() !== 'test') {
      throw new Error('LEASE_BILLING_TEST_DATE_OVERRIDE_FORBIDDEN');
    }
    const runId = options.runId ?? `lease-billing-${randomUUID()}`;
    const dedicatedClient = await this.database.client.connect();
    let acquired = false;
    try {
      const today = options.businessDate ?? (await this.jakartaToday(dedicatedClient));
      const lock = await dedicatedClient.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
        [SCHEDULER_LOCK_NAME],
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) {
        const skipped: LeaseBillingRunResult = {
          run_id: runId,
          business_date: today,
          status: 'skipped_advisory_lock',
          properties_considered: 0,
          leases_processed: 0,
          leases_failed: 0,
          cycles_advanced: 0,
          invoices_issued: 0,
          catch_up_limited: 0,
        };
        this.logger.debug(
          JSON.stringify({ event: 'lease_billing_skipped_advisory_lock', ...skipped }),
        );
        return skipped;
      }

      const enabledPropertyIds = await this.features.schedulerEnabledPropertyIds(dedicatedClient);
      const result: LeaseBillingRunResult = {
        run_id: runId,
        business_date: today,
        status: 'completed',
        properties_considered: enabledPropertyIds.length,
        leases_processed: 0,
        leases_failed: 0,
        cycles_advanced: 0,
        invoices_issued: 0,
        catch_up_limited: 0,
      };

      for (const propertyId of enabledPropertyIds) {
        const attemptedLeaseIds = new Set<string>();
        for (;;) {
          const processed = await this.processNextDueLease(
            propertyId,
            today,
            runId,
            attemptedLeaseIds,
          );
          if (processed.state === 'none') break;
          if (processed.state === 'failed') {
            result.leases_failed += 1;
            if (!processed.leaseId) break;
            attemptedLeaseIds.add(processed.leaseId);
            continue;
          }
          attemptedLeaseIds.add(processed.leaseId);
          result.leases_processed += 1;
          result.cycles_advanced += processed.cyclesAdvanced;
          result.invoices_issued += processed.invoicesIssued;
          if (processed.catchUpLimited) result.catch_up_limited += 1;
        }
      }
      this.logger.log(JSON.stringify({ event: 'lease_billing_completed', ...result }));
      return result;
    } finally {
      if (acquired) {
        await dedicatedClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
          SCHEDULER_LOCK_NAME,
        ]);
      }
      dedicatedClient.release();
    }
  }

  private async processNextDueLease(
    propertyId: string,
    businessDate: string,
    runId: string,
    attemptedLeaseIds: Set<string>,
  ): Promise<ProcessResult> {
    let selectedLeaseId: string | null = null;
    try {
      return await this.leases.transaction(async (client) => {
        const property = await this.lockProperty(client, propertyId);
        if (!(await this.features.isSchedulerEnabled(propertyId, client))) return { state: 'none' };
        const candidate = await this.selectDueLease(client, propertyId, businessDate, [
          ...attemptedLeaseIds,
        ]);
        if (!candidate) return { state: 'none' };
        selectedLeaseId = candidate.id;

        // After the lease lock, use the same lifecycle order as transfer:
        // room, resident, occupancy, invoices. Scheduler has no ledger writes.
        const room = await this.lockRoom(client, candidate.room_id);
        const resident = await this.lockResident(client, candidate.resident_id);
        const occupancy = await this.lockOccupancy(client, candidate.occupancy_id);
        this.assertLeaseLinks(candidate, room, resident, occupancy, propertyId);

        let nextBillingDate = candidate.next_billing_date;
        let cyclesAdvanced = 0;
        let invoicesIssued = 0;
        while (nextBillingDate <= businessDate && cyclesAdvanced < MAX_CATCH_UP_CYCLES) {
          const cycleEnd = previousDate(
            nextBillingStart(
              nextBillingDate,
              candidate.billing_cycle,
              candidate.billing_anchor_day,
            ),
          );
          const rentAmount =
            candidate.billing_cycle === 'monthly'
              ? Number(candidate.snapshot_monthly_price)
              : Number(candidate.snapshot_yearly_price);
          const invoice = await this.insertOrReadInvoice(
            client,
            candidate,
            resident,
            nextBillingDate,
            cycleEnd,
            rentAmount,
            property.default_due_day ?? 25,
            businessDate,
          );
          if (invoice.inserted) {
            invoicesIssued += 1;
            await this.insertHistory(client, propertyId, candidate.id, businessDate, {
              invoice_id: invoice.id,
              amount: rentAmount,
              source: 'scheduler',
            });
            await this.writeOutbox(client, {
              propertyId,
              eventKey: `billing.invoice_issued:${invoice.id}`,
              eventType: 'billing.invoice_issued',
              aggregateType: 'invoice',
              aggregateId: invoice.id,
              payload: { invoice_id: invoice.id, lease_id: candidate.id, amount: rentAmount },
              correlationId: runId,
            });
          }
          nextBillingDate = nextBillingStart(
            nextBillingDate,
            candidate.billing_cycle,
            candidate.billing_anchor_day,
          );
          cyclesAdvanced += 1;
        }
        if (cyclesAdvanced > 0) {
          await client.query(
            `UPDATE leases SET next_billing_date = $2::date, updated_at = now() WHERE id = $1`,
            [candidate.id, nextBillingDate],
          );
        }

        const catchUpLimited =
          cyclesAdvanced === MAX_CATCH_UP_CYCLES && nextBillingDate <= businessDate;
        if (catchUpLimited) {
          await this.writeOutbox(client, {
            propertyId,
            eventKey: `lease.billing_catchup_limit_reached:${candidate.id}:${businessDate}`,
            eventType: 'lease.billing_catchup_limit_reached',
            aggregateType: 'lease',
            aggregateId: candidate.id,
            payload: {
              lease_id: candidate.id,
              business_date: businessDate,
              max_cycles: MAX_CATCH_UP_CYCLES,
              next_billing_date: nextBillingDate,
            },
            correlationId: runId,
          });
        }
        await this.writeAudit(client, propertyId, candidate.id, runId, {
          cycles_advanced: cyclesAdvanced,
          invoices_issued: invoicesIssued,
          catch_up_limited: catchUpLimited,
          next_billing_date: nextBillingDate,
        });
        return {
          state: 'processed',
          leaseId: candidate.id,
          cyclesAdvanced,
          invoicesIssued,
          catchUpLimited,
        };
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'lease_billing_lease_failed',
          run_id: runId,
          property_id: propertyId,
          lease_id: selectedLeaseId,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      return { state: 'failed', leaseId: selectedLeaseId };
    }
  }

  private async selectDueLease(
    client: PoolClient,
    propertyId: string,
    businessDate: string,
    attemptedLeaseIds: string[],
  ): Promise<SchedulerLeaseRow | null> {
    const result = await client.query<SchedulerLeaseRow>(
      `SELECT id, property_id, lease_code, resident_id, room_id, occupancy_id, lease_status,
              billing_cycle, billing_anchor_day, next_billing_date::text,
              snapshot_monthly_price, snapshot_yearly_price, snapshot_room_number
       FROM leases
       WHERE property_id = $1
         AND lease_status = 'active'
         AND next_billing_date <= $2::date
         AND NOT (id = ANY($3::uuid[]))
       ORDER BY next_billing_date, id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [propertyId, businessDate, attemptedLeaseIds],
    );
    return result.rows[0] ?? null;
  }

  private async lockProperty(
    client: PoolClient,
    propertyId: string,
  ): Promise<SchedulerPropertyRow> {
    const result = await client.query<SchedulerPropertyRow>(
      `SELECT properties.id, COALESCE(property_settings.default_due_day, 25) AS default_due_day
       FROM properties
       LEFT JOIN property_settings ON property_settings.property_id = properties.id
       WHERE properties.id = $1 AND properties.status = 'active'
       FOR SHARE OF properties`,
      [propertyId],
    );
    if (!result.rows[0]) throw new Error('LEASE_BILLING_PROPERTY_NOT_ACTIVE');
    return result.rows[0];
  }

  private async lockRoom(client: PoolClient, roomId: string): Promise<SchedulerRoomRow> {
    const result = await client.query<SchedulerRoomRow>(
      `SELECT id, property_id, room_status FROM rooms WHERE id = $1 FOR SHARE`,
      [roomId],
    );
    if (!result.rows[0]) throw new Error('LEASE_BILLING_ROOM_MISSING');
    return result.rows[0];
  }

  private async lockResident(
    client: PoolClient,
    residentId: string,
  ): Promise<SchedulerResidentRow> {
    const result = await client.query<SchedulerResidentRow>(
      `SELECT id, property_id, full_name, resident_status FROM residents WHERE id = $1 FOR SHARE`,
      [residentId],
    );
    if (!result.rows[0]) throw new Error('LEASE_BILLING_RESIDENT_MISSING');
    return result.rows[0];
  }

  private async lockOccupancy(
    client: PoolClient,
    occupancyId: string,
  ): Promise<SchedulerOccupancyRow> {
    const result = await client.query<SchedulerOccupancyRow>(
      `SELECT id, property_id, room_id, resident_id, occupancy_status
       FROM occupancies WHERE id = $1 FOR SHARE`,
      [occupancyId],
    );
    if (!result.rows[0]) throw new Error('LEASE_BILLING_OCCUPANCY_MISSING');
    return result.rows[0];
  }

  private assertLeaseLinks(
    lease: SchedulerLeaseRow,
    room: SchedulerRoomRow,
    resident: SchedulerResidentRow,
    occupancy: SchedulerOccupancyRow,
    propertyId: string,
  ): void {
    if (
      lease.lease_status !== 'active' ||
      room.property_id !== propertyId ||
      room.room_status !== 'occupied' ||
      resident.property_id !== propertyId ||
      resident.resident_status !== 'active' ||
      occupancy.property_id !== propertyId ||
      occupancy.room_id !== lease.room_id ||
      occupancy.resident_id !== lease.resident_id ||
      occupancy.occupancy_status !== 'active'
    ) {
      throw new Error('LEASE_BILLING_LIFECYCLE_STATE_CONFLICT');
    }
  }

  private async insertOrReadInvoice(
    client: PoolClient,
    lease: SchedulerLeaseRow,
    resident: SchedulerResidentRow,
    cycleStart: string,
    cycleEnd: string,
    rentAmount: number,
    dueDay: number,
    issueDate: string,
  ): Promise<{ id: string; inserted: boolean }> {
    const dueCandidate = dueDateWithinCycle(cycleStart, cycleEnd, dueDay);
    const dueDate = dueCandidate < issueDate ? issueDate : dueCandidate;
    const invoiceCode = `INV-${lease.lease_code}-${cycleStart.replaceAll('-', '')}`;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO invoices (
         property_id, resident_id, room_id, occupancy_id, billing_period_id, lease_id,
         invoice_code, invoice_status, subtotal_amount, late_fee_amount, total_amount,
         due_date, issued_at, snapshot_period_key, snapshot_period_start_date, snapshot_period_end_date,
         snapshot_room_number, snapshot_resident_name, snapshot_monthly_price,
         cycle_start_date, cycle_end_date, snapshot_billing_cycle, snapshot_rent_amount,
         generation_source, created_by_user_id
       ) VALUES (
         $1, $2, $3, $4, NULL, $5, $6, 'issued', $7, 0, $7, $8::date, now(),
         $9, $10::date, $11::date, $12, $13, $14, $10::date, $11::date, $15, $7, 'auto', NULL
       )
       ON CONFLICT (lease_id, cycle_start_date) WHERE lease_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        lease.property_id,
        lease.resident_id,
        lease.room_id,
        lease.occupancy_id,
        lease.id,
        invoiceCode,
        rentAmount,
        dueDate,
        `lease:${lease.lease_code}:${cycleStart}`,
        cycleStart,
        cycleEnd,
        lease.snapshot_room_number,
        resident.full_name,
        lease.snapshot_monthly_price,
        lease.billing_cycle,
      ],
    );
    if (inserted.rows[0]) {
      await client.query(
        `INSERT INTO invoice_line_items (
           invoice_id, line_type, description, quantity, unit_amount, total_amount, sort_order, metadata
         ) VALUES ($1, 'rent', 'Lease rent', 1, $2, $2, 0, $3::jsonb)`,
        [
          inserted.rows[0].id,
          rentAmount,
          JSON.stringify({ lease_id: lease.id, billing_cycle: lease.billing_cycle }),
        ],
      );
      return { id: inserted.rows[0].id, inserted: true };
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM invoices
       WHERE lease_id = $1 AND cycle_start_date = $2::date
       FOR SHARE`,
      [lease.id, cycleStart],
    );
    if (!existing.rows[0]) throw new Error('LEASE_BILLING_INVOICE_CONFLICT_UNRESOLVED');
    return { id: existing.rows[0].id, inserted: false };
  }

  private async insertHistory(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    eventDate: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO lease_history (property_id, lease_id, event_type, actor_user_id, event_date, metadata)
       VALUES ($1, $2, 'invoice_generated', NULL, $3::date, $4::jsonb)`,
      [propertyId, leaseId, eventDate, JSON.stringify(metadata)],
    );
  }

  private async writeAudit(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
    runId: string,
    afterData: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs (
         actor_user_id, property_id, action, resource_type, resource_id, after_data,
         result_status, correlation_id
       ) VALUES (NULL, $1, 'lease.billing_scheduler', 'lease', $2, $3::jsonb, 'success', $4)`,
      [propertyId, leaseId, JSON.stringify(afterData), runId],
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
      payload: Record<string, unknown>;
      correlationId: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId,
      ],
    );
  }

  private automaticProcessEnabled(): boolean {
    if (!this.config.get<boolean>('lease.billingSchedulerProcessEnabled')) return false;
    const environment = this.environment();
    if (environment === 'staging' || environment === 'production') {
      this.logger.warn(
        'Lease billing scheduler automatic process is blocked outside disposable environments',
      );
      return false;
    }
    return true;
  }

  private scheduleNextAutomaticRun(): void {
    if (this.destroyed) return;
    const target = nextJakartaBillingRun(new Date());
    this.timer = setTimeout(
      () => {
        void this.runOnce()
          .catch((error: unknown) => {
            this.logger.error(
              JSON.stringify({
                event: 'lease_billing_run_failed',
                error: error instanceof Error ? error.message : 'unknown',
              }),
            );
          })
          .finally(() => {
            this.scheduleNextAutomaticRun();
          });
      },
      Math.max(1, target.getTime() - Date.now()),
    );
    this.timer.unref();
    this.logger.log(
      JSON.stringify({ event: 'lease_billing_scheduled', scheduled_for: target.toISOString() }),
    );
  }

  private environment(): string {
    return this.config.get<string>('app.env') ?? process.env.NODE_ENV ?? 'development';
  }

  private async jakartaToday(client: PoolClient): Promise<string> {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }
}

/** Returns the next daily 00:10 Asia/Jakarta timestamp (UTC+7, no DST). */
export function nextJakartaBillingRun(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  let timestamp = Date.UTC(year, month - 1, day, 0, 10) - JAKARTA_OFFSET_MS;
  if (timestamp < now.getTime()) {
    timestamp = Date.UTC(year, month - 1, day + 1, 0, 10) - JAKARTA_OFFSET_MS;
  }
  return new Date(timestamp);
}
