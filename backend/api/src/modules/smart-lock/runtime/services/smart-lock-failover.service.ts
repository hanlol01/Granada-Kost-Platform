import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { SmartLockResolvedGatewayContext } from '../types/smart-lock-runtime.types';

@Injectable()
export class SmartLockFailoverService {
  classify(result: SmartLockGatewayResult, context: SmartLockResolvedGatewayContext): {
    canFailover: boolean;
    reason: string;
    gatewayId: string;
  } {
    if (result.success) {
      return { canFailover: false, reason: 'success', gatewayId: context.gateway.id };
    }
    return {
      canFailover: false,
      reason: 'device_binding_requires_same_gateway',
      gatewayId: context.gateway.id,
    };
  }
}
