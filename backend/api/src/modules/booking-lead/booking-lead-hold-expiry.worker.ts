import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BookingLeadHoldRepository } from './repositories/booking-lead-hold.repository';

const EXPIRY_INTERVAL_MS = 60_000;
const EXPIRY_BATCH_LIMIT = 100;

@Injectable()
export class BookingLeadHoldExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingLeadHoldExpiryWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private destroyed = false;

  constructor(private readonly holds: BookingLeadHoldRepository) {}

  onModuleInit(): void {
    this.scheduleNextRun();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(runId = `booking-hold-expiry-${randomUUID()}`): Promise<number> {
    const expired = await this.holds.expireDueBatch(EXPIRY_BATCH_LIMIT, runId);
    this.logger.log(
      JSON.stringify({ event: 'booking_lead_hold_expiry_completed', run_id: runId, expired }),
    );
    return expired;
  }

  private scheduleNextRun(): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(() => {
          this.logger.error(
            JSON.stringify({ event: 'booking_lead_hold_expiry_failed', error: 'run_failed' }),
          );
        })
        .finally(() => this.scheduleNextRun());
    }, EXPIRY_INTERVAL_MS);
    this.timer.unref();
  }
}
