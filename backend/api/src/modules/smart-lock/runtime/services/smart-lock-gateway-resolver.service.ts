import { BadRequestException, Injectable } from '@nestjs/common';
import { SmartLockDeviceRecord } from '../../types/smart-lock.types';
import { SmartLockGatewayCredentialRepository } from '../repositories/smart-lock-gateway-credential.repository';
import { SmartLockDeviceGatewayRepository } from '../repositories/smart-lock-device-gateway.repository';
import { SmartLockGatewayRepository } from '../repositories/smart-lock-gateway.repository';
import {
  SmartLockGatewayCapability,
  SmartLockProviderContext,
  SmartLockResolvedGatewayContext,
} from '../types/smart-lock-runtime.types';
import { SmartLockSecretResolutionService } from './smart-lock-secret-resolution.service';

@Injectable()
export class SmartLockGatewayResolverService {
  constructor(
    private readonly deviceGateways: SmartLockDeviceGatewayRepository,
    private readonly gateways: SmartLockGatewayRepository,
    private readonly credentials: SmartLockGatewayCredentialRepository,
    private readonly secrets: SmartLockSecretResolutionService,
  ) {}

  async resolveForDevice(
    device: SmartLockDeviceRecord,
    capability: SmartLockGatewayCapability,
    correlationId?: string,
  ): Promise<{ resolved: SmartLockResolvedGatewayContext; providerContext: SmartLockProviderContext }> {
    const mapping = await this.deviceGateways.findActiveForDevice(device.id);
    if (!mapping) {
      return this.resolveLegacy(device, correlationId);
    }

    const gateway = await this.gateways.findById(mapping.gatewayId);
    if (!gateway) {
      throw new BadRequestException({ code: 'SMART_LOCK_GATEWAY_MAPPING_BROKEN', message: 'Smart lock gateway mapping is invalid' });
    }
    this.assertGatewayCanServe(gateway.gatewayStatus, Boolean(gateway.capabilities[capability] ?? true));
    const credential = await this.credentials.findActiveForGateway(gateway.id);
    const resolved = {
      gateway,
      providerDeviceId: mapping.providerDeviceId,
      mapping,
      resolutionSource: 'device_mapping' as const,
    };
    return {
      resolved,
      providerContext: {
        gateway,
        providerDeviceId: mapping.providerDeviceId,
        correlationId,
        secretRef: this.secrets.resolve(gateway, credential),
      },
    };
  }

  async resolveDiagnosticsForDevice(
    device: SmartLockDeviceRecord,
    correlationId?: string,
  ): Promise<{ resolved: SmartLockResolvedGatewayContext; providerContext: SmartLockProviderContext }> {
    const mapping = await this.deviceGateways.findActiveForDevice(device.id);
    if (!mapping) {
      throw new BadRequestException({
        code: 'DEVICE_NOT_MAPPED',
        message: 'Smart lock device has no active gateway mapping for provider diagnostics',
      });
    }

    const gateway = await this.gateways.findById(mapping.gatewayId);
    if (!gateway) {
      throw new BadRequestException({ code: 'SMART_LOCK_GATEWAY_MAPPING_BROKEN', message: 'Smart lock gateway mapping is invalid' });
    }
    this.assertGatewayCanServe(gateway.gatewayStatus, Boolean(gateway.capabilities.sync_status ?? true));
    const credential = await this.credentials.findActiveForGateway(gateway.id);
    const resolved = {
      gateway,
      providerDeviceId: mapping.providerDeviceId,
      mapping,
      resolutionSource: 'device_mapping' as const,
    };
    return {
      resolved,
      providerContext: {
        gateway,
        providerDeviceId: mapping.providerDeviceId,
        correlationId,
        secretRef: this.secrets.resolve(gateway, credential),
      },
    };
  }

  private async resolveLegacy(
    device: SmartLockDeviceRecord,
    correlationId?: string,
  ): Promise<{ resolved: SmartLockResolvedGatewayContext; providerContext: SmartLockProviderContext }> {
    const gateways = await this.gateways.candidatesForOnboarding(device.propertyId, 'tuya');
    const gateway = gateways[0];
    if (!gateway) {
      throw new BadRequestException({
        code: 'SMART_LOCK_GATEWAY_MAPPING_REQUIRED',
        message: 'Smart lock device has no active gateway mapping',
      });
    }
    const credential = await this.credentials.findActiveForGateway(gateway.id);
    const resolved = {
      gateway,
      providerDeviceId: device.tuyaDeviceId,
      mapping: null,
      resolutionSource: 'legacy_device_id' as const,
    };
    return {
      resolved,
      providerContext: {
        gateway,
        providerDeviceId: device.tuyaDeviceId,
        correlationId,
        secretRef: this.secrets.resolve(gateway, credential),
      },
    };
  }

  private assertGatewayCanServe(status: string, hasCapability: boolean): void {
    if (!['active', 'degraded'].includes(status)) {
      throw new BadRequestException({ code: 'SMART_LOCK_GATEWAY_NOT_ACTIVE', message: 'Smart lock gateway is not available' });
    }
    if (!hasCapability) {
      throw new BadRequestException({ code: 'SMART_LOCK_GATEWAY_CAPABILITY_UNSUPPORTED', message: 'Smart lock gateway capability is unsupported' });
    }
  }
}
