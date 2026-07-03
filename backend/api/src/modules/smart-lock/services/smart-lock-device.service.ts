import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockGatewayResult } from '../gateways/smart-lock-gateway.interface';
import { SmartLockStatusTransitionHelper } from '../helpers/smart-lock-status-transition.helper';
import { SmartLockDeviceRepository } from '../repositories/smart-lock-device.repository';
import { SmartLockGatewayHealthRepository } from '../runtime/repositories/smart-lock-gateway-health.repository';
import { SmartLockRuntimeService } from '../runtime/services/smart-lock-runtime.service';
import {
  SmartLockGatewayHealthRecord,
  SmartLockGatewayHealthStatus,
  SmartLockReadOnlyDiagnosticResult,
  SmartLockReadOnlySyncData,
} from '../runtime/types/smart-lock-runtime.types';
import {
  RegisterSmartLockDeviceInput,
  SmartLockAccessAction,
  SmartLockAccessSource,
  SmartLockAccessTrigger,
  SmartLockAuditContext,
  SmartLockDeviceRecord,
  SmartLockDeviceStatus,
  SmartLockDeviceStatusPatch,
} from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

export type SmartLockDeviceSyncResult = {
  providerResult: SmartLockGatewayResult;
  device: SmartLockDeviceRecord;
  persisted: boolean;
  persistedFields: string[];
  gatewayHealth: SmartLockGatewayHealthRecord | null;
};

@Injectable()
export class SmartLockDeviceService {
  constructor(
    private readonly devices: SmartLockDeviceRepository,
    private readonly runtime: SmartLockRuntimeService,
    private readonly gatewayHealth: SmartLockGatewayHealthRepository,
    private readonly audit: SmartLockAuditService,
  ) {}

  list(propertyId: string, status?: SmartLockDeviceStatus, limit?: number, offset?: number): Promise<SmartLockDeviceRecord[]> {
    return this.devices.list(propertyId, status, limit, offset);
  }

  async get(deviceId: string): Promise<SmartLockDeviceRecord> {
    const device = await this.devices.findById(deviceId);
    if (!device) {
      throw new NotFoundException({ code: 'SMART_LOCK_DEVICE_NOT_FOUND', message: 'Smart lock device not found' });
    }
    return device;
  }

  async registerDevice(input: RegisterSmartLockDeviceInput, context: SmartLockAuditContext = {}): Promise<SmartLockDeviceRecord> {
    const existing = await this.devices.findActiveByRoom(input.roomId);
    if (existing) {
      throw new ConflictException({
        code: 'SMART_LOCK_ROOM_DEVICE_ALREADY_EXISTS',
        message: 'Room already has an active or non-decommissioned smart lock device',
      });
    }
    const device = await this.devices.create(input);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceRegister,
      resourceType: 'smart_lock_device',
      resourceId: device.id,
      propertyId: device.propertyId,
      afterData: this.auditSnapshot(device),
      context,
    });
    return device;
  }

  async updateStatus(deviceId: string, patch: SmartLockDeviceStatusPatch, context: SmartLockAuditContext = {}): Promise<SmartLockDeviceRecord> {
    const current = await this.get(deviceId);
    if (patch.deviceStatus) {
      SmartLockStatusTransitionHelper.assertDeviceTransition(current.deviceStatus, patch.deviceStatus);
    }
    const updated = await this.devices.updateStatus(deviceId, patch);
    if (!updated) {
      throw new BadRequestException({ code: 'SMART_LOCK_DEVICE_UPDATE_FAILED', message: 'Smart lock device update failed' });
    }
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceStatusSync,
      resourceType: 'smart_lock_device',
      resourceId: updated.id,
      propertyId: updated.propertyId,
      beforeData: this.auditSnapshot(current),
      afterData: this.auditSnapshot(updated),
      context,
    });
    return updated;
  }

  async syncStatus(device: SmartLockDeviceRecord, context: SmartLockAuditContext = {}): Promise<SmartLockDeviceSyncResult> {
    const result = await this.runtime.syncDeviceStatus(device, context.correlationId);
    const syncData = asReadOnlySyncData(result.data);
    const { patch, fields } = result.success && syncData ? this.buildReadOnlySyncPatch(syncData) : { patch: {}, fields: [] };
    let syncedDevice = device;
    if (result.success) {
      const updated = await this.devices.updateStatus(device.id, patch);
      if (!updated) {
        throw new BadRequestException({ code: 'SMART_LOCK_DEVICE_SYNC_FAILED', message: 'Smart lock device sync failed' });
      }
      syncedDevice = updated;
      fields.push('last_synced_at');
    }
    const gatewayHealth = await this.recordGatewayHealth(result, syncData);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceReadOnlySync,
      resourceType: 'smart_lock_device',
      resourceId: device.id,
      propertyId: device.propertyId,
      beforeData: this.auditSnapshot(device),
      afterData: {
        provider: result.provider,
        providerMode: syncData?.providerMode,
        resultStatus: result.resultStatus,
        syncResultStatus: syncData?.syncResultStatus,
        reason: syncData?.reason,
        errorCode: result.errorCode,
        gatewayId: safeStringFromData(result.data, 'gatewayId'),
        persistedFields: fields,
        normalized: syncData?.normalized,
        capabilitySummary: syncData?.capabilitySummary,
      },
      resultStatus: result.success ? 'success' : 'failed',
      context,
    });
    return {
      providerResult: result,
      device: syncedDevice,
      persisted: result.success,
      persistedFields: fields,
      gatewayHealth,
    };
  }

  async readDiagnostics(
    device: SmartLockDeviceRecord,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockReadOnlyDiagnosticResult> {
    const result = await this.runtime.readDiagnostics(device, context.correlationId);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceDiagnosticRead,
      resourceType: 'smart_lock_device',
      resourceId: device.id,
      propertyId: device.propertyId,
      afterData: {
        provider: result.provider,
        providerMode: result.providerMode,
        gatewayId: result.gateway.id,
        resultStatus: result.resultStatus,
        sectionStatuses: {
          health: result.health.resultStatus,
          metadata: result.sections.metadata.resultStatus,
          status: result.sections.status.resultStatus,
          functions: result.sections.functions.resultStatus,
          specifications: result.sections.specifications.resultStatus,
        },
        errorCodes: {
          health: result.health.errorCode,
          metadata: result.sections.metadata.errorCode,
          status: result.sections.status.errorCode,
          functions: result.sections.functions.errorCode,
          specifications: result.sections.specifications.errorCode,
        },
      },
      resultStatus: result.resultStatus === 'failed' ? 'failed' : 'success',
      context,
    });
    return result;
  }

  async executeCommand(
    deviceId: string,
    action: SmartLockAccessAction,
    options: {
      source: SmartLockAccessSource;
      trigger?: SmartLockAccessTrigger;
      residentId?: string;
      context?: SmartLockAuditContext;
    },
  ) {
    const device = await this.get(deviceId);
    const result = await this.runtime.executeCommand(device, action, options.context?.correlationId);
    const auditAction = this.commandAuditAction(action);
    await this.audit.writeDomainAudit({
      action: auditAction,
      resourceType: 'smart_lock_device',
      resourceId: device.id,
      propertyId: device.propertyId,
      afterData: {
        action,
        simulated: true,
        provider: result.provider,
        resultStatus: result.resultStatus,
        errorCode: result.errorCode,
      },
      resultStatus: result.success ? 'success' : 'failed',
      context: options.context,
    });
    await this.audit.writeAccessLog(device, {
      residentId: options.residentId ?? null,
      actorUserId: options.context?.actorUserId ?? null,
      actionType: action,
      source: options.source,
      trigger: options.trigger ?? 'manual',
      resultStatus: result.resultStatus,
      failureReason: result.errorCode ?? null,
      credentialTypeUsed: action === 'unlock' ? 'remote' : null,
      ipAddress: options.context?.ipAddress ?? null,
      userAgent: options.context?.userAgent ?? null,
      correlationId: options.context?.correlationId ?? null,
      metadata: { simulated: true, provider: result.provider },
    });
    return {
      simulated: true,
      action,
      accepted: result.success,
      result_status: result.resultStatus,
      error_code: result.errorCode,
    };
  }

  async decommission(deviceId: string, context: SmartLockAuditContext = {}): Promise<SmartLockDeviceRecord> {
    const updated = await this.updateStatus(deviceId, { deviceStatus: 'decommissioned' }, context);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceDecommission,
      resourceType: 'smart_lock_device',
      resourceId: updated.id,
      propertyId: updated.propertyId,
      afterData: this.auditSnapshot(updated),
      context,
    });
    return updated;
  }

  private auditSnapshot(device: SmartLockDeviceRecord): Record<string, unknown> {
    return {
      id: device.id,
      roomId: device.roomId,
      deviceStatus: device.deviceStatus,
      connectionStatus: device.connectionStatus,
      lockState: device.lockState,
      normalOpenMode: device.normalOpenMode,
    };
  }

  private buildReadOnlySyncPatch(data: SmartLockReadOnlySyncData): { patch: SmartLockDeviceStatusPatch; fields: string[] } {
    const patch: SmartLockDeviceStatusPatch = {};
    const fields: string[] = [];
    if (data.normalized.connectionStatus) {
      patch.connectionStatus = data.normalized.connectionStatus;
      fields.push('connection_status');
    }
    if (data.normalized.lockState) {
      patch.lockState = data.normalized.lockState;
      fields.push('lock_state');
    }
    if (typeof data.normalized.batteryPercent === 'number') {
      patch.batteryPercent = data.normalized.batteryPercent;
      fields.push('battery_percent');
    }
    if (data.normalized.firmwareVersion) {
      patch.firmwareVersion = data.normalized.firmwareVersion;
      fields.push('firmware_version');
    }
    if (data.normalized.model) {
      patch.model = data.normalized.model;
      fields.push('model');
    }
    return { patch, fields };
  }

  private async recordGatewayHealth(
    result: SmartLockGatewayResult,
    data: SmartLockReadOnlySyncData | null,
  ): Promise<SmartLockGatewayHealthRecord | null> {
    const gatewayId = safeStringFromData(result.data, 'gatewayId');
    if (!gatewayId) {
      return null;
    }
    const healthStatus = data?.healthStatus ?? this.healthStatusFromResult(result);
    return this.gatewayHealth.upsert({
      gatewayId,
      healthStatus,
      latencyMs: data?.latencyMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      metadata: {
        operation: 'read_only_sync',
        provider: result.provider,
        providerMode: data?.providerMode,
        syncResultStatus: data?.syncResultStatus,
        reason: data?.reason,
        liveCommandEnabled: data?.liveCommandEnabled,
        retryable: safeBooleanFromData(result.data, 'retryable'),
        failoverReason: safeStringFromData(result.data, 'failoverReason'),
        providerDeviceIdMasked: data?.providerDeviceIdMasked,
        sectionStatuses: data?.sectionStatuses,
        errorCodes: data?.errorCodes,
        normalized: data?.normalized,
        capabilitySummary: data?.capabilitySummary,
        statusCodes: data?.statusCodes,
      },
    });
  }

  private healthStatusFromResult(result: SmartLockGatewayResult): SmartLockGatewayHealthStatus {
    if (result.success) {
      return 'healthy';
    }
    if (result.resultStatus === 'device_offline' || result.resultStatus === 'timeout') {
      return 'degraded';
    }
    return 'unhealthy';
  }

  private commandAuditAction(action: SmartLockAccessAction): string {
    const actions: Partial<Record<SmartLockAccessAction, string>> = {
      lock: SMART_LOCK_AUDIT_ACTIONS.lock,
      unlock: SMART_LOCK_AUDIT_ACTIONS.unlock,
      remote_unlock: SMART_LOCK_AUDIT_ACTIONS.remoteUnlock,
      emergency_unlock: SMART_LOCK_AUDIT_ACTIONS.emergencyUnlock,
      normal_open_mode: SMART_LOCK_AUDIT_ACTIONS.normalOpenModeToggle,
      normal_open_mode_on: SMART_LOCK_AUDIT_ACTIONS.normalOpenModeToggle,
      normal_open_mode_off: SMART_LOCK_AUDIT_ACTIONS.normalOpenModeToggle,
    };
    return actions[action] ?? `smart_lock.${action}`;
  }
}

function asReadOnlySyncData(value: unknown): SmartLockReadOnlySyncData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.syncPurpose === 'read_only_sync' ? (value as SmartLockReadOnlySyncData) : null;
}

function safeStringFromData(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function safeBooleanFromData(data: unknown, key: string): boolean | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}
