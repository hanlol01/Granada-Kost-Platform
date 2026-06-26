import { Injectable } from '@nestjs/common';
import { SmartLockGatewayHealthRepository } from '../repositories/smart-lock-gateway-health.repository';
import { SmartLockGatewayRepository } from '../repositories/smart-lock-gateway.repository';
import { SmartLockGatewayRecord } from '../types/smart-lock-runtime.types';
import { SmartLockProviderRegistryService } from './smart-lock-provider-registry.service';
import { SmartLockSecretResolutionService } from './smart-lock-secret-resolution.service';

@Injectable()
export class SmartLockGatewayHealthService {
  constructor(
    private readonly gateways: SmartLockGatewayRepository,
    private readonly health: SmartLockGatewayHealthRepository,
    private readonly providers: SmartLockProviderRegistryService,
    private readonly secrets: SmartLockSecretResolutionService,
  ) {}

  async checkGateway(gateway: SmartLockGatewayRecord) {
    const provider = this.providers.resolve(gateway.providerType);
    const started = Date.now();
    const result = await provider.healthCheck({
      gateway,
      providerDeviceId: '',
      secretRef: this.secrets.resolve(gateway),
    });
    const health = await this.health.upsert({
      gatewayId: gateway.id,
      healthStatus: result.healthStatus,
      latencyMs: result.latencyMs ?? Date.now() - started,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      metadata: result.metadata,
    });
    if (result.healthStatus === 'degraded' || result.healthStatus === 'unhealthy') {
      await this.gateways.updateStatus(gateway.id, 'degraded');
    }
    return health;
  }

  find(gatewayId: string) {
    return this.health.find(gatewayId);
  }
}
