import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseRenewalService } from './lease-renewal.service';
import { LeaseRepository } from './lease.repository';

const SCHEDULER_LOCK_NAME = 'granada-lease-renewal-v1';
const AUTOMATIC_INTERVAL_MS = 5 * 60 * 1000;
const AUTOMATIC_START_DELAY_MS = 30 * 1000;

export type LeaseRenewalRunResult = {
  run_id: string;
  business_date: string;
  status: 'completed' | 'skipped_advisory_lock';
  properties_considered: number;
  commands_activated: number;
  commands_failed: number;
  commands_skipped: number;
  late_activations: number;
};

/**
 * W07C renewal executor. It is off unless the independent process gate is
 * enabled and each property separately opts in. It may only call the service
 * for commands that are already approved, financially prepared, and explicitly
 * activation-authorized; incomplete financial authority remains retryable.
 */
@Injectable()
export class LeaseRenewalScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaseRenewalScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly renewals: LeaseRenewalService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.automaticProcessEnabled()) {
      this.logger.log('Lease renewal scheduler automatic process is disabled');
      return;
    }
    this.scheduleNextAutomaticRun(AUTOMATIC_START_DELAY_MS);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(
    options: { businessDate?: string; runId?: string } = {},
  ): Promise<LeaseRenewalRunResult> {
    if (options.businessDate && this.environment() !== 'test') {
      throw new Error('LEASE_RENEWAL_TEST_DATE_OVERRIDE_FORBIDDEN');
    }
    const runId = options.runId ?? `lease-renewal-${randomUUID()}`;
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
        return {
          run_id: runId,
          business_date: today,
          status: 'skipped_advisory_lock',
          properties_considered: 0,
          commands_activated: 0,
          commands_failed: 0,
          commands_skipped: 0,
          late_activations: 0,
        };
      }
      const propertyIds = await this.features.renewalSchedulerEnabledPropertyIds(dedicatedClient);
      const result: LeaseRenewalRunResult = {
        run_id: runId,
        business_date: today,
        status: 'completed',
        properties_considered: propertyIds.length,
        commands_activated: 0,
        commands_failed: 0,
        commands_skipped: 0,
        late_activations: 0,
      };
      for (const propertyId of propertyIds) {
        const attempted = new Set<string>();
        for (;;) {
          const commandId = await this.selectDueCommandId(propertyId, today, attempted);
          if (!commandId) break;
          attempted.add(commandId);
          const outcome = await this.renewals.executeAuthorizedRenewal(commandId, runId);
          if (outcome.state === 'activated') {
            result.commands_activated += 1;
            if (outcome.late) result.late_activations += 1;
          } else if (outcome.state === 'failed') {
            result.commands_failed += 1;
          } else {
            result.commands_skipped += 1;
          }
        }
      }
      this.logger.log(JSON.stringify({ event: 'lease_renewal_completed', ...result }));
      return result;
    } finally {
      if (acquired) {
        try {
          await dedicatedClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
            SCHEDULER_LOCK_NAME,
          ]);
        } catch {
          // Session loss releases the advisory lock; preserve the primary outcome.
        }
      }
      dedicatedClient.release();
    }
  }

  private async selectDueCommandId(
    propertyId: string,
    businessDate: string,
    attempted: Set<string>,
  ): Promise<string | null> {
    const result = await this.leases.query<{ id: string }>(
      `SELECT id
       FROM lease_renewal_commands
       WHERE property_id=$1
         AND state='approved'
         AND effective_date<=$2::date
         AND financial_prepared_at IS NOT NULL
         AND first_invoice_id IS NOT NULL
         AND activation_authorized_at IS NOT NULL
         AND NOT (id = ANY($3::uuid[]))
       ORDER BY effective_date,created_at,id
       LIMIT 1`,
      [propertyId, businessDate, [...attempted]],
    );
    return result.rows[0]?.id ?? null;
  }

  private async jakartaToday(client: PoolClient): Promise<string> {
    return (
      await client.query<{ today: string }>(
        `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
      )
    ).rows[0].today;
  }

  private environment(): string {
    return this.config.get<string>('app.env') ?? process.env.NODE_ENV ?? 'development';
  }

  private automaticProcessEnabled(): boolean {
    return this.config.get<boolean>('lease.renewalSchedulerProcessEnabled') === true;
  }

  private scheduleNextAutomaticRun(delayMs: number): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) => {
          this.logger.error(
            JSON.stringify({
              event: 'lease_renewal_run_failed',
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        })
        .finally(() => this.scheduleNextAutomaticRun(AUTOMATIC_INTERVAL_MS));
    }, delayMs);
    this.timer.unref?.();
  }
}
