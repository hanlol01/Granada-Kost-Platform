import { SmartLockAccessAction, SmartLockCredentialType } from '../types/smart-lock.types';

export type SmartLockGatewayResult<T = Record<string, unknown>> = {
  success: boolean;
  resultStatus: 'success' | 'failed' | 'queued' | 'device_offline' | 'timeout';
  provider: 'tuya' | 'simulated';
  providerRequestId?: string;
  errorCode?: string;
  errorMessage?: string;
  data?: T;
};

export type SmartLockGatewayCredentialInput = {
  deviceId: string;
  credentialType: SmartLockCredentialType;
  credentialLabel: string;
  externalCredentialRef?: string;
};

export interface SmartLockGateway {
  syncDeviceStatus(tuyaDeviceId: string): Promise<SmartLockGatewayResult>;
  executeCommand(tuyaDeviceId: string, action: SmartLockAccessAction): Promise<SmartLockGatewayResult>;
  createCredential(input: SmartLockGatewayCredentialInput): Promise<SmartLockGatewayResult>;
  disableCredential(tuyaDeviceId: string, tuyaCredentialId: string): Promise<SmartLockGatewayResult>;
}
