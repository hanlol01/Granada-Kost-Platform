import { Injectable } from '@nestjs/common';
import { TuyaSmartLockGateway } from '../../gateways/tuya-smart-lock.gateway';
import { SmartLockAccessAction } from '../../types/smart-lock.types';
import {
  SmartLockProvider,
  SmartLockProviderContext,
  SmartLockProviderHealthResult,
} from '../types/smart-lock-runtime.types';

@Injectable()
export class TuyaSmartLockProvider implements SmartLockProvider {
  readonly providerType = 'tuya' as const;

  constructor(private readonly gateway: TuyaSmartLockGateway) {}

  healthCheck(_context: SmartLockProviderContext): Promise<SmartLockProviderHealthResult> {
    void _context;
    return Promise.resolve({
      healthStatus: 'unknown',
      errorCode: 'TUYA_PROVIDER_SKELETON',
      errorMessage: 'Tuya provider runtime is wired but real health check is not implemented in M10F.',
      metadata: { provider: this.providerType, simulated: true },
    });
  }

  syncDeviceStatus(context: SmartLockProviderContext) {
    return this.gateway.syncDeviceStatus(context.providerDeviceId);
  }

  executeCommand(context: SmartLockProviderContext, action: SmartLockAccessAction) {
    return this.gateway.executeCommand(context.providerDeviceId, action);
  }
}
