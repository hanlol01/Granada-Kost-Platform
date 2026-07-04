import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import type {
  SmartLockDiagnosticCapability,
  SmartLockDiagnosticSection,
  SmartLockDiagnosticStatusEntry,
  SmartLockReadOnlySyncData,
  SmartLockReadOnlyDiagnosticResult,
} from '../runtime/types/smart-lock-runtime.types';
import type { SmartLockDeviceSyncResult } from '../services/smart-lock-device.service';
import {
  SmartLockAccessLogRecord,
  SmartLockAlertRecord,
  SmartLockCredentialRecord,
  SmartLockDeviceRecord,
  SmartLockRestrictionRecord,
} from '../types/smart-lock.types';

export function auditContext(user: UserAccessContext, request: RequestWithCorrelationId) {
  return {
    actorUserId: user.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    correlationId: request.correlationId,
  };
}

export async function scopedPropertyIds(
  properties: PropertyService,
  user: UserAccessContext,
  propertyId?: string,
): Promise<string[]> {
  if (propertyId) {
    await properties.assertCanReadProperty(user, propertyId);
    return [propertyId];
  }

  if (user.roles.includes('owner')) {
    return (await properties.list(user)).map((property) => property.id);
  }

  return user.propertyIds;
}

export function toSmartLockDeviceResponse(device: SmartLockDeviceRecord, includeProviderRef = true) {
  return {
    id: device.id,
    property_id: device.propertyId,
    room_id: device.roomId,
    device_name: device.deviceName,
    tuya_device_id: includeProviderRef ? device.tuyaDeviceId : undefined,
    model: device.model,
    connection_status: device.connectionStatus,
    lock_state: device.lockState,
    device_status: device.deviceStatus,
    battery_percent: device.batteryPercent,
    auto_lock_enabled: device.autoLockEnabled,
    auto_lock_delay_seconds: device.autoLockDelaySeconds,
    firmware_version: device.firmwareVersion,
    normal_open_mode: device.normalOpenMode,
    last_synced_at: device.lastSyncedAt,
    last_activity_at: device.lastActivityAt,
    commissioned_at: device.commissionedAt,
    decommissioned_at: device.decommissionedAt,
    created_at: device.createdAt,
    updated_at: device.updatedAt,
  };
}

export function toSmartLockDiagnosticResponse(result: SmartLockReadOnlyDiagnosticResult) {
  return {
    provider: result.provider,
    provider_mode: result.providerMode,
    live_command_enabled: result.liveCommandEnabled,
    result_status: result.resultStatus,
    provider_device_id_masked: result.providerDeviceIdMasked,
    timestamp: result.timestamp,
    correlation_id: result.correlationId,
    gateway: {
      id: result.gateway.id,
      code: result.gateway.code,
      status: result.gateway.status,
      region: result.gateway.region,
      resolution_source: result.gateway.resolutionSource,
    },
    health: toDiagnosticSectionResponse(result.health, (data) => ({
      health_status: data.healthStatus,
      token_check: data.tokenCheck,
      device_check: data.deviceCheck,
      credential_source: data.credentialSource,
    })),
    sections: {
      metadata: toDiagnosticSectionResponse(result.sections.metadata),
      status: toDiagnosticSectionResponse(result.sections.status, (data) => ({
        values: data.values.map(toStatusEntryResponse),
      })),
      functions: toDiagnosticSectionResponse(result.sections.functions, (data) => ({
        capabilities: data.capabilities.map(toCapabilityResponse),
      })),
      specifications: toDiagnosticSectionResponse(result.sections.specifications, (data) => ({
        capabilities: data.capabilities.map(toCapabilityResponse),
      })),
    },
  };
}

export function toSmartLockSyncResponse(result: SmartLockDeviceSyncResult) {
  const providerData = asReadOnlySyncData(result.providerResult.data);
  return {
    accepted: result.providerResult.success,
    provider: result.providerResult.provider,
    result_status: result.providerResult.resultStatus,
    provider_request_id: result.providerResult.providerRequestId,
    error_code: result.providerResult.errorCode,
    error_message: result.providerResult.errorMessage,
    persisted: result.persisted,
    persisted_fields: result.persistedFields,
    device: toSmartLockDeviceResponse(result.device, false),
    gateway_health: result.gatewayHealth
      ? {
          gateway_id: result.gatewayHealth.gatewayId,
          health_status: result.gatewayHealth.healthStatus,
          last_checked_at: result.gatewayHealth.lastCheckedAt,
          last_success_at: result.gatewayHealth.lastSuccessAt,
          latency_ms: result.gatewayHealth.latencyMs,
          error_code: result.gatewayHealth.errorCode,
          consecutive_failures: result.gatewayHealth.consecutiveFailures,
        }
      : undefined,
    read_only_sync: providerData ? toReadOnlySyncDataResponse(providerData) : undefined,
    data: providerData ? toReadOnlySyncDataResponse(providerData) : undefined,
  };
}

function toDiagnosticSectionResponse<TData>(
  section: SmartLockDiagnosticSection<TData>,
  mapData: (data: TData) => unknown = (data) => data,
) {
  return {
    result_status: section.resultStatus,
    operation: section.operation,
    source: section.source,
    data: section.data === undefined ? undefined : mapData(section.data),
    error_code: section.errorCode,
    error_message: section.errorMessage,
    latency_ms: section.latencyMs,
  };
}

function toStatusEntryResponse(entry: SmartLockDiagnosticStatusEntry) {
  return {
    code: entry.code,
    value: entry.value,
  };
}

function toCapabilityResponse(capability: SmartLockDiagnosticCapability) {
  return {
    code: capability.code,
    type: capability.type,
    name: capability.name,
    value_type: capability.valueType,
  };
}

function toReadOnlySyncDataResponse(data: SmartLockReadOnlySyncData) {
  return {
    sync_purpose: data.syncPurpose,
    provider_mode: data.providerMode,
    live_command_enabled: data.liveCommandEnabled,
    sync_result_status: data.syncResultStatus,
    provider_device_id_masked: data.providerDeviceIdMasked,
    health_status: data.healthStatus,
    reason: data.reason,
    latency_ms: data.latencyMs,
    normalized: {
      connection_status: data.normalized.connectionStatus,
      lock_state: data.normalized.lockState,
      battery_percent: data.normalized.batteryPercent,
      battery_status: data.normalized.batteryStatus,
      door_state: data.normalized.doorState,
      firmware_version: data.normalized.firmwareVersion,
      model: data.normalized.model,
    },
    capability_summary: {
      supports_remote_unlock: data.capabilitySummary.supportsRemoteUnlock,
      supports_remote_lock: data.capabilitySummary.supportsRemoteLock,
      supports_temporary_pin: data.capabilitySummary.supportsTemporaryPin,
      supports_battery_status: data.capabilitySummary.supportsBatteryStatus,
      supports_door_status: data.capabilitySummary.supportsDoorStatus,
      supports_event_logs: data.capabilitySummary.supportsEventLogs,
      observed_codes: data.capabilitySummary.observedCodes,
    },
    status_codes: data.statusCodes,
    section_statuses: {
      health: data.sectionStatuses.health,
      metadata: data.sectionStatuses.metadata,
      status: data.sectionStatuses.status,
      functions: data.sectionStatuses.functions,
      specifications: data.sectionStatuses.specifications,
    },
    error_codes: {
      health: data.errorCodes.health,
      metadata: data.errorCodes.metadata,
      status: data.errorCodes.status,
      functions: data.errorCodes.functions,
      specifications: data.errorCodes.specifications,
    },
  };
}

function asReadOnlySyncData(value: unknown): SmartLockReadOnlySyncData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.syncPurpose === 'read_only_sync' ? (value as SmartLockReadOnlySyncData) : null;
}

export function toSmartLockCredentialResponse(credential: SmartLockCredentialRecord) {
  return {
    id: credential.id,
    smart_lock_device_id: credential.smartLockDeviceId,
    access_grant_id: credential.accessGrantId,
    credential_type: credential.credentialType,
    credential_status: credential.credentialStatus,
    credential_label: credential.credentialLabel,
    valid_from: credential.validFrom,
    valid_until: credential.validUntil,
    finger_index: credential.fingerIndex,
    card_number_masked: credential.cardNumberMasked,
    disabled_at: credential.disabledAt,
    disable_reason: credential.disableReason,
    created_at: credential.createdAt,
    updated_at: credential.updatedAt,
  };
}

export function toSmartLockRestrictionResponse(restriction: SmartLockRestrictionRecord) {
  return {
    id: restriction.id,
    property_id: restriction.propertyId,
    smart_lock_device_id: restriction.smartLockDeviceId,
    room_id: restriction.roomId,
    resident_id: restriction.residentId,
    reason_type: restriction.reasonType,
    reason_description: restriction.reasonDescription,
    reason_ref_type: restriction.reasonRefType,
    reason_ref_id: restriction.reasonRefId,
    restriction_status: restriction.restrictionStatus,
    requested_by_user_id: restriction.requestedByUserId,
    approved_by_user_id: restriction.approvedByUserId,
    approved_at: restriction.approvedAt,
    grace_period_ends_at: restriction.gracePeriodEndsAt,
    applied_at: restriction.appliedAt,
    lifted_at: restriction.liftedAt,
    lift_reason: restriction.liftReason,
    lift_suggested_at: restriction.liftSuggestedAt,
    rejected_at: restriction.rejectedAt,
    rejection_reason: restriction.rejectionReason,
    cancelled_at: restriction.cancelledAt,
    cancel_reason: restriction.cancelReason,
    created_at: restriction.createdAt,
    updated_at: restriction.updatedAt,
  };
}

export function toSmartLockAccessLogResponse(log: SmartLockAccessLogRecord) {
  return {
    id: log.id,
    property_id: log.propertyId,
    smart_lock_device_id: log.smartLockDeviceId,
    room_id: log.roomId,
    resident_id: log.residentId,
    actor_user_id: log.actorUserId,
    action_type: log.actionType,
    source: log.source,
    trigger: log.trigger,
    result_status: log.resultStatus,
    failure_reason: log.failureReason,
    credential_type_used: log.credentialTypeUsed,
    correlation_id: log.correlationId,
    metadata: log.metadata,
    occurred_at: log.occurredAt,
  };
}

export function toSmartLockAlertResponse(alert: SmartLockAlertRecord) {
  return {
    id: alert.id,
    property_id: alert.propertyId,
    smart_lock_device_id: alert.smartLockDeviceId,
    alert_type: alert.alertType,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    alert_status: alert.alertStatus,
    alert_data: alert.alertData,
    raised_at: alert.raisedAt,
    acknowledged_at: alert.acknowledgedAt,
    resolved_at: alert.resolvedAt,
    created_at: alert.createdAt,
  };
}
