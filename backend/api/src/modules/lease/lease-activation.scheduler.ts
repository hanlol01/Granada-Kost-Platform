import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { LeaseActivationService } from './lease-activation.service';
import { LeaseFeatureService } from './lease-feature.service';

const SCHEDULER_LOCK_NAME = 'granada-lease-activation-v2';
const AUTOMATIC_INTERVAL_MS = 5 * 60 * 1000;
const AUTOMATIC_START_DELAY_MS = 30 * 1000;

export type LeaseActivationRunResult = {
  run_id: string;
  business_date: string;
  status: 'completed' | 'skipped_advisory_lock';
  properties_considered: number;
  leases_activated: number;
  activation_attention_required: number;
  technical_failures: number;
  already_satisfied: number;
  check_in_confirmation_required: number;
};

@Injectable()
export class LeaseActivationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaseActivationScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly features: LeaseFeatureService,
    private readonly activations: LeaseActivationService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.automaticProcessEnabled()) {
      this.logger.log('Lease activation scheduler automatic process is disabled');
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
  ): Promise<LeaseActivationRunResult> {
    if (options.businessDate && this.environment() !== 'test')
      throw new Error('LEASE_ACTIVATION_TEST_DATE_OVERRIDE_FORBIDDEN');

    const runId = options.runId ?? `lease-activation-${randomUUID()}`;
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
          leases_activated: 0,
          activation_attention_required: 0,
          technical_failures: 0,
          already_satisfied: 0,
          check_in_confirmation_required: 0,
        };

      const propertyIds = await this.features.activationSchedulerEnabledPropertyIds(dedicatedClient);
      const result: LeaseActivationRunResult = {
        run_id: runId,
        business_date: businessDate,
        status: 'completed',
        properties_considered: propertyIds.length,
        leases_activated: 0,
        activation_attention_required: 0,
        technical_failures: 0,
        already_satisfied: 0,
        check_in_confirmation_required: 0,
      };

      for (const propertyId of propertyIds) {
        const attempted = new Set<string>();
        while (await this.features.isActivationSchedulerEnabled(propertyId, dedicatedClient)) {
          const leaseId = await this.selectDueActivation(
            dedicatedClient,
            propertyId,
            options.businessDate ?? null,
            attempted,
          );
          if (!leaseId) break;
          attempted.add(leaseId);
          const outcome = await this.activations.activateAutomatically(
            propertyId,
            leaseId,
            businessDate,
            runId,
          );
          if (outcome.state === 'activated') result.leases_activated += 1;
          else if (outcome.state === 'attention_required')
            result.activation_attention_required += 1;
          else if (outcome.state === 'technical_failure') result.technical_failures += 1;
          else result.already_satisfied += 1;
        }

        const reconciled = new Set<string>();
        while (await this.features.isActivationSchedulerEnabled(propertyId, dedicatedClient)) {
          const leaseId = await this.selectDueNoShow(
            dedicatedClient,
            propertyId,
            options.businessDate ?? null,
            reconciled,
          );
          if (!leaseId) break;
          reconciled.add(leaseId);
          try {
            if (await this.activations.reconcileNoShow(propertyId, leaseId, businessDate, runId))
              result.check_in_confirmation_required += 1;
          } catch (error) {
            result.technical_failures += 1;
            this.logger.error(
              JSON.stringify({
                event: 'lease_check_in_reconciliation_failed',
                property_id: propertyId,
                lease_id: leaseId,
                run_id: runId,
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
      }
      this.logger.log(JSON.stringify({ event: 'lease_activation_completed', ...result }));
      return result;
    } finally {
      if (acquired) {
        try {
          await dedicatedClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
            SCHEDULER_LOCK_NAME,
          ]);
        } catch {
          // The session itself releases the lock if the connection has failed.
        }
      }
      dedicatedClient.release();
    }
  }

  private async selectDueActivation(
    client: PoolClient,
    propertyId: string,
    testBusinessDate: string | null,
    attempted: Set<string>,
  ): Promise<string | null> {
    const result = await client.query<{ lease_id: string }>(
      `SELECT lifecycle.lease_id
         FROM lease_activation_lifecycles lifecycle
         JOIN leases lease ON lease.id=lifecycle.lease_id AND lease.property_id=lifecycle.property_id
        WHERE lifecycle.property_id=$1 AND lifecycle.state='scheduled'
          AND lease.lease_status='awaiting_activation'
          AND lease.renewed_from_lease_id IS NULL
          AND lifecycle.cutoff_at <= CASE
            WHEN $2::date IS NULL THEN now()
            ELSE (($2::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Jakarta')
          END
          AND NOT (lifecycle.lease_id = ANY($3::uuid[]))
        ORDER BY lifecycle.cutoff_at,lifecycle.lease_id
        LIMIT 1`,
      [propertyId, testBusinessDate, [...attempted]],
    );
    return result.rows[0]?.lease_id ?? null;
  }

  private async selectDueNoShow(
    client: PoolClient,
    propertyId: string,
    testBusinessDate: string | null,
    attempted: Set<string>,
  ): Promise<string | null> {
    const result = await client.query<{ lease_id: string }>(
      `SELECT lifecycle.lease_id
         FROM lease_activation_lifecycles lifecycle
         JOIN leases lease ON lease.id=lifecycle.lease_id AND lease.property_id=lifecycle.property_id
        WHERE lifecycle.property_id=$1 AND lifecycle.state='awaiting_check_in'
          AND lease.lease_status='active' AND lease.occupancy_id IS NULL
          AND lifecycle.check_in_due_at <= CASE
            WHEN $2::date IS NULL THEN now()
            ELSE (($2::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Jakarta')
          END
          AND NOT (lifecycle.lease_id = ANY($3::uuid[]))
        ORDER BY lifecycle.check_in_due_at,lifecycle.lease_id
        LIMIT 1`,
      [propertyId, testBusinessDate, [...attempted]],
    );
    return result.rows[0]?.lease_id ?? null;
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

  private automaticProcessEnabled(): boolean {
    return this.config.get<boolean>('lease.activationSchedulerProcessEnabled') === true;
  }

  private scheduleNextAutomaticRun(delayMs: number): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) => {
          this.logger.error(
            JSON.stringify({
              event: 'lease_activation_run_failed',
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        })
        .finally(() => this.scheduleNextAutomaticRun(AUTOMATIC_INTERVAL_MS));
    }, delayMs);
    this.timer.unref?.();
  }
}
