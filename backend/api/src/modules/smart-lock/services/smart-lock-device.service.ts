import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockStatusTransitionHelper } from '../helpers/smart-lock-status-transition.helper';
import { SmartLockDeviceRepository } from '../repositories/smart-lock-device.repository';
import { SmartLockRuntimeService } from '../runtime/services/smart-lock-runtime.service';
import { SmartLockReadOnlyDiagnosticResult } from '../runtime/types/smart-lock-runtime.types';
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

@Injectable()
export class SmartLockDeviceService {
  constructor(
    private readonly devices: SmartLockDeviceRepository,
    private readonly runtime: SmartLockRuntimeService,
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

  async syncStatus(deviceId: string, context: SmartLockAuditContext = {}) {
    const device = await this.get(deviceId);
    const result = await this.runtime.syncDeviceStatus(device, context.correlationId);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.deviceStatusSync,
      resourceType: 'smart_lock_device',
      resourceId: device.id,
      propertyId: device.propertyId,
      afterData: { provider: result.provider, resultStatus: result.resultStatus, errorCode: result.errorCode },
      resultStatus: result.success ? 'success' : 'failed',
      context,
    });
    return result;
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
