import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SmartLockGatewayCredentialRepository } from '../repositories/smart-lock-gateway-credential.repository';
import { SmartLockGatewayRepository } from '../repositories/smart-lock-gateway.repository';
import {
  CreateSmartLockGatewayInput,
  SmartLockGatewayCapability,
  SmartLockGatewayRecord,
  SmartLockGatewayStatus,
  SmartLockProviderType,
} from '../types/smart-lock-runtime.types';

@Injectable()
export class SmartLockGatewayRegistryService {
  constructor(
    private readonly gateways: SmartLockGatewayRepository,
    private readonly credentials: SmartLockGatewayCredentialRepository,
  ) {}

  async registerGateway(input: CreateSmartLockGatewayInput): Promise<SmartLockGatewayRecord> {
    const gateway = await this.gateways.create(input);
    await this.credentials.create({
      gatewayId: gateway.id,
      credentialRef: input.credentialRef,
      metadata: { source: 'gateway_registry' },
    });
    return gateway;
  }

  async requireGateway(gatewayId: string): Promise<SmartLockGatewayRecord> {
    const gateway = await this.gateways.findById(gatewayId);
    if (!gateway) {
      throw new NotFoundException({ code: 'SMART_LOCK_GATEWAY_NOT_FOUND', message: 'Smart lock gateway not found' });
    }
    return gateway;
  }

  listByProperty(propertyId: string): Promise<SmartLockGatewayRecord[]> {
    return this.gateways.listByProperty(propertyId);
  }

  async selectForOnboarding(
    propertyId: string,
    providerType: SmartLockProviderType,
    capability: SmartLockGatewayCapability,
  ): Promise<SmartLockGatewayRecord> {
    const candidates = await this.gateways.candidatesForOnboarding(propertyId, providerType);
    const selected = candidates.find((gateway) => gateway.capabilities[capability] !== false);
    if (!selected) {
      throw new BadRequestException({
        code: 'SMART_LOCK_GATEWAY_UNAVAILABLE_FOR_ONBOARDING',
        message: 'No active smart lock gateway is available for onboarding',
      });
    }
    return selected;
  }

  updateStatus(gatewayId: string, status: SmartLockGatewayStatus): Promise<SmartLockGatewayRecord | null> {
    return this.gateways.updateStatus(gatewayId, status);
  }
}
