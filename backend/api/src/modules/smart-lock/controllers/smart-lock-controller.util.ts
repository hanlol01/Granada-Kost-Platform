import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
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
