import { Injectable } from '@nestjs/common';
import {
  SmartLockGateway,
  SmartLockGatewayCredentialInput,
  SmartLockGatewayResult,
} from './smart-lock-gateway.interface';
import { SmartLockAccessAction } from '../types/smart-lock.types';

@Injectable()
export class TuyaSmartLockGateway implements SmartLockGateway {
  syncDeviceStatus(_tuyaDeviceId: string): Promise<SmartLockGatewayResult> {
    void _tuyaDeviceId;
    return Promise.resolve(this.notImplemented());
  }

  executeCommand(_tuyaDeviceId: string, _action: SmartLockAccessAction): Promise<SmartLockGatewayResult> {
    void _tuyaDeviceId;
    void _action;
    return Promise.resolve(this.notImplemented());
  }

  createCredential(_input: SmartLockGatewayCredentialInput): Promise<SmartLockGatewayResult> {
    void _input;
    return Promise.resolve(this.notImplemented());
  }

  disableCredential(_tuyaDeviceId: string, _tuyaCredentialId: string): Promise<SmartLockGatewayResult> {
    void _tuyaDeviceId;
    void _tuyaCredentialId;
    return Promise.resolve(this.notImplemented());
  }

  private notImplemented(): SmartLockGatewayResult {
    return {
      success: false,
      resultStatus: 'failed',
      provider: 'tuya',
      errorCode: 'TUYA_GATEWAY_NOT_IMPLEMENTED',
      errorMessage: 'Tuya Smart Lock gateway is a foundation skeleton only.',
    };
  }
}
