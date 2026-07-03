import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { SmartLockAccessAction } from '../../types/smart-lock.types';
import type { SmartLockProviderErrorCode } from '../providers/tuya/tuya-error-normalization';

export type SmartLockProviderType = 'tuya';
export type SmartLockGatewayStatus = 'active' | 'degraded' | 'maintenance' | 'draining' | 'disabled';
export type SmartLockGatewayHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type SmartLockGatewayCredentialStatus = 'active' | 'rotating' | 'revoked';
export type SmartLockDeviceGatewayStatus = 'active' | 'migrating' | 'retired';

export type SmartLockGatewayCapability =
  | 'lock'
  | 'unlock'
  | 'remote_unlock'
  | 'emergency_unlock'
  | 'sync_status'
  | 'credential_create'
  | 'credential_disable'
  | 'access_log'
  | 'normal_open_mode';

export type SmartLockGatewayCapabilities = Partial<Record<SmartLockGatewayCapability, boolean>>;

export type SmartLockGatewayRecord = {
  id: string;
  propertyId: string;
  providerType: SmartLockProviderType;
  gatewayCode: string;
  displayName: string;
  gatewayStatus: SmartLockGatewayStatus;
  priority: number;
  weight: number;
  capacityLimit: number;
  capacityUsed: number;
  region: string | null;
  credentialRef: string;
  capabilities: SmartLockGatewayCapabilities;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSmartLockGatewayInput = {
  propertyId: string;
  providerType: SmartLockProviderType;
  gatewayCode: string;
  displayName: string;
  priority?: number;
  weight?: number;
  capacityLimit?: number;
  region?: string;
  credentialRef: string;
  capabilities?: SmartLockGatewayCapabilities;
};

export type SmartLockGatewayCredentialRecord = {
  id: string;
  gatewayId: string;
  credentialRef: string;
  credentialStatus: SmartLockGatewayCredentialStatus;
  keyId: string | null;
  version: string;
  metadata: Record<string, unknown>;
  activatedAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SmartLockDeviceGatewayRecord = {
  id: string;
  smartLockDeviceId: string;
  gatewayId: string;
  providerDeviceId: string;
  mappingStatus: SmartLockDeviceGatewayStatus;
  boundAt: Date;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SmartLockGatewayHealthRecord = {
  gatewayId: string;
  healthStatus: SmartLockGatewayHealthStatus;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  consecutiveFailures: number;
  metadata: Record<string, unknown>;
  updatedAt: Date;
};

export type SmartLockResolvedGatewayContext = {
  gateway: SmartLockGatewayRecord;
  providerDeviceId: string;
  mapping: SmartLockDeviceGatewayRecord | null;
  resolutionSource: 'device_mapping' | 'legacy_device_id';
};

export type SmartLockSecretReference = {
  credentialRef: string;
  keyId?: string;
  version?: string;
};

export type SmartLockProviderContext = {
  gateway: SmartLockGatewayRecord;
  providerDeviceId: string;
  correlationId?: string;
  secretRef: SmartLockSecretReference;
};

export type SmartLockProviderHealthResult = {
  healthStatus: SmartLockGatewayHealthStatus;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export type SmartLockDiagnosticResultStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'timeout'
  | 'device_offline';

export type SmartLockDiagnosticSectionStatus = 'success' | 'failed' | 'skipped' | 'timeout' | 'device_offline';

export type SmartLockDiagnosticSection<TData = Record<string, unknown>> = {
  resultStatus: SmartLockDiagnosticSectionStatus;
  operation: 'device_metadata' | 'device_status' | 'device_functions' | 'device_specifications' | 'provider_health';
  source?: 'tuya_v1' | 'tuya_iot_03_fallback' | 'simulated';
  data?: TData;
  errorCode?: SmartLockProviderErrorCode;
  errorMessage?: string;
  latencyMs?: number;
};

export type SmartLockDiagnosticCapability = {
  code: string;
  type?: string;
  name?: string;
  valueType?: string;
};

export type SmartLockDiagnosticStatusEntry = {
  code: string;
  value: string | number | boolean | null;
};

export type SmartLockReadOnlyDiagnosticResult = {
  provider: SmartLockProviderType;
  providerMode: 'simulated' | 'tuya';
  liveCommandEnabled: boolean;
  resultStatus: SmartLockDiagnosticResultStatus;
  providerDeviceIdMasked: string | null;
  timestamp: string;
  correlationId?: string;
  gateway: {
    id: string;
    code: string;
    status: SmartLockGatewayStatus;
    region: string | null;
    resolutionSource?: SmartLockResolvedGatewayContext['resolutionSource'];
  };
  health: SmartLockDiagnosticSection<{
    healthStatus: SmartLockGatewayHealthStatus;
    tokenCheck?: string;
    deviceCheck?: string;
    credentialSource?: string;
  }>;
  sections: {
    metadata: SmartLockDiagnosticSection<Record<string, unknown>>;
    status: SmartLockDiagnosticSection<{ values: SmartLockDiagnosticStatusEntry[] }>;
    functions: SmartLockDiagnosticSection<{ capabilities: SmartLockDiagnosticCapability[] }>;
    specifications: SmartLockDiagnosticSection<{ capabilities: SmartLockDiagnosticCapability[] }>;
  };
};

export type SmartLockProvider = {
  readonly providerType: SmartLockProviderType;
  healthCheck(context: SmartLockProviderContext): Promise<SmartLockProviderHealthResult>;
  readDiagnostics(context: SmartLockProviderContext): Promise<SmartLockReadOnlyDiagnosticResult>;
  syncDeviceStatus(context: SmartLockProviderContext): Promise<SmartLockGatewayResult>;
  executeCommand(context: SmartLockProviderContext, action: SmartLockAccessAction): Promise<SmartLockGatewayResult>;
};
