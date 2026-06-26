import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';

@Injectable()
export class SmartLockRetryPolicyService {
  shouldRetry(result: SmartLockGatewayResult): boolean {
    return ['timeout', 'device_offline'].includes(result.resultStatus) || result.errorCode === 'RATE_LIMITED';
  }

  nextDelayMs(attempt: number): number {
    const schedule = [0, 5_000, 30_000, 120_000];
    return schedule[Math.min(attempt, schedule.length - 1)];
  }
}
