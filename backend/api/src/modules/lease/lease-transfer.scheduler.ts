import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { LeaseFeatureService } from './lease-feature.service';
import { LeaseTransferService } from './lease-transfer.service';
import { LeaseRepository } from './lease.repository';

const SCHEDULER_LOCK_NAME = 'granada-lease-transfer-v1';
const AUTOMATIC_INTERVAL_MS = 5 * 60 * 1000;
const AUTOMATIC_START_DELAY_MS = 30 * 1000;
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export type LeaseTransferRunResult = {
  run_id: string;
  business_date: string;
  status: 'completed' | 'skipped_advisory_lock';
  properties_considered: number;
  commands_executed: number;
  commands_failed: number;
  commands_skipped: number;
  late_executions: number;
};

/**
 * W07B scheduled-transfer executor. A native timer intentionally avoids a
 * scheduler dependency and remains off unless the explicit process switch
 * (LEASE_TRANSFER_SCHEDULER_PROCESS_ENABLED) is true; each property still
 * needs the `lease_transfer` feature flag before any command executes. All
 * lifecycle writes stay inside LeaseTransferService transactions; this class
 * only picks due commands.
 */
@Injectable()
export class LeaseTransferScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaseTransferScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly leases: LeaseRepository,
    private readonly features: LeaseFeatureService,
    private readonly transfers: LeaseTransferService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.automaticProcessEnabled()) {
      this.logger.log('Lease transfer scheduler automatic process is disabled');
      return;
    }
    this.scheduleNextAutomaticRun(AUTOMATIC_START_DELAY_MS);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * An internal/test hook. There is intentionally no HTTP endpoint for this
   * method. businessDate overrides are accepted only under NODE_ENV=test so a
   * deployed scheduler cannot be asked to execute future cutovers.
   */
  async runOnce(
    options: { businessDate?: string; runId?: string } = {},
  ): Promise<LeaseTransferRunResult> {
    if (options.businessDate && this.environment() !== 'test') {
      throw new Error('LEASE_TRANSFER_TEST_DATE_OVERRIDE_FORBIDDEN');
    }
    const runId = options.runId ?? `lease-transfer-${randomUUID()}`;
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
        const skipped: LeaseTransferRunResult = {
          run_id: runId,
          business_date: today,
          status: 'skipped_advisory_lock',
          properties_considered: 0,
          commands_executed: 0,
          commands_failed: 0,
          commands_skipped: 0,
          late_executions: 0,
        };
        this.logger.debug(
          JSON.stringify({ event: 'lease_transfer_skipped_advisory_lock', ...skipped }),
        );
        return skipped;
      }

      const enabledPropertyIds =
        await this.features.transferSchedulerEnabledPropertyIds(dedicatedClient);
      const result: LeaseTransferRunResult = {
        run_id: runId,
        business_date: today,
        status: 'completed',
        properties_considered: enabledPropertyIds.length,
        commands_executed: 0,
        commands_failed: 0,
        commands_skipped: 0,
        late_executions: 0,
      };

      for (const propertyId of enabledPropertyIds) {
        const attemptedCommandIds = new Set<string>();
        for (;;) {
          const commandId = await this.selectDueCommandId(propertyId, today, attemptedCommandIds);
          if (!commandId) break;
          attemptedCommandIds.add(commandId);
          const outcome = await this.transfers.executeScheduledTransfer(commandId, runId);
          if (outcome.state === 'executed') {
            result.commands_executed += 1;
            if (outcome.late) result.late_executions += 1;
            continue;
          }
          if (outcome.state === 'failed') {
            result.commands_failed += 1;
            continue;
          }
          result.commands_skipped += 1;
        }
      }
      this.logger.log(JSON.stringify({ event: 'lease_transfer_completed', ...result }));
      return result;
    } finally {
      if (acquired) {
        // A dead connection must not mask the original outcome; the advisory
        // lock dies with its session anyway.
        try {
          await dedicatedClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
            SCHEDULER_LOCK_NAME,
          ]);
        } catch {
          // ignore unlock failures on a broken connection
        }
      }
      dedicatedClient.release();
    }
  }

  private async selectDueCommandId(
    propertyId: string,
    businessDate: string,
    attemptedCommandIds: Set<string>,
  ): Promise<string | null> {
    const result = await this.leases.query<{ id: string }>(
      `SELECT id
       FROM lease_transfer_commands
       WHERE property_id = $1
         AND state = 'scheduled'
         AND effective_date <= $2::date
         AND NOT (id = ANY($3::uuid[]))
       ORDER BY effective_date, created_at, id
       LIMIT 1`,
      [propertyId, businessDate, [...attemptedCommandIds]],
    );
    return result.rows[0]?.id ?? null;
  }

  private async jakartaToday(client: PoolClient): Promise<string> {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  private environment(): string {
    return this.config.get<string>('app.env') ?? process.env.NODE_ENV ?? 'development';
  }

  /**
   * Activation depends only on the explicit process env gate here; the
   * per-property `lease_transfer` feature flag is enforced inside runOnce
   * (transferSchedulerEnabledPropertyIds) and again inside every cutover
   * transaction (assertTransferEnabled). No environment-based block applies.
   */
  private automaticProcessEnabled(): boolean {
    return this.config.get<boolean>('lease.transferSchedulerProcessEnabled') === true;
  }

  private scheduleNextAutomaticRun(delayMs: number): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) => {
          this.logger.error(
            JSON.stringify({
              event: 'lease_transfer_run_failed',
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        })
        .finally(() => this.scheduleNextAutomaticRun(AUTOMATIC_INTERVAL_MS));
    }, delayMs);
    this.timer.unref?.();
  }
}

// Keep the Jakarta business date derivation local and dependency-free.
export function transferSchedulerJakartaDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
