import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { SmartLockAccessAction, SmartLockDeviceRecord } from '../../types/smart-lock.types';
import { SmartLockGatewayCapability } from '../types/smart-lock-runtime.types';
import { SmartLockFailoverService } from './smart-lock-failover.service';
import { SmartLockGatewayResolverService } from './smart-lock-gateway-resolver.service';
import { SmartLockProviderRegistryService } from './smart-lock-provider-registry.service';
import { SmartLockRetryPolicyService } from './smart-lock-retry-policy.service';

@Injectable()
export class SmartLockRuntimeService {
  constructor(
    private readonly resolver: SmartLockGatewayResolverService,
    private readonly providers: SmartLockProviderRegistryService,
    private readonly retryPolicy: SmartLockRetryPolicyService,
    private readonly failover: SmartLockFailoverService,
  ) {}

  async syncDeviceStatus(device: SmartLockDeviceRecord, correlationId?: string): Promise<SmartLockGatewayResult> {
    const { resolved, providerContext } = await this.resolver.resolveForDevice(device, 'sync_status', correlationId);
    const provider = this.providers.resolve(providerContext.gateway.providerType);
    const result = await provider.syncDeviceStatus(providerContext);
    return this.withRuntimeMetadata(result, resolved.gateway.id, this.retryPolicy.shouldRetry(result), this.failover.classify(result, resolved).reason);
  }

  async executeCommand(
    device: SmartLockDeviceRecord,
    action: SmartLockAccessAction,
    correlationId?: string,
  ): Promise<SmartLockGatewayResult> {
    const { resolved, providerContext } = await this.resolver.resolveForDevice(device, this.capabilityForAction(action), correlationId);
    const provider = this.providers.resolve(providerContext.gateway.providerType);
    const result = await provider.executeCommand(providerContext, action);
    const retryable = this.retryPolicy.shouldRetry(result);
    const failover = this.failover.classify(result, resolved);
    return this.withRuntimeMetadata(result, resolved.gateway.id, retryable, failover.reason);
  }

  private capabilityForAction(action: SmartLockAccessAction): SmartLockGatewayCapability {
    const map: Partial<Record<SmartLockAccessAction, SmartLockGatewayCapability>> = {
      lock: 'lock',
      unlock: 'unlock',
      remote_unlock: 'remote_unlock',
      emergency_unlock: 'emergency_unlock',
      normal_open_mode: 'normal_open_mode',
      normal_open_mode_on: 'normal_open_mode',
      normal_open_mode_off: 'normal_open_mode',
    };
    return map[action] ?? 'sync_status';
  }

  private withRuntimeMetadata(
    result: SmartLockGatewayResult,
    gatewayId: string,
    retryable: boolean,
    failoverReason: string,
  ): SmartLockGatewayResult {
    return {
      ...result,
      data: {
        ...(result.data ?? {}),
        gatewayId,
        retryable,
        failoverReason,
      },
    };
  }
}
