export type SmartLockConnectionStatus = 'online' | 'offline' | 'unknown';
export type SmartLockState = 'locked' | 'unlocked' | 'unknown';
export type SmartLockDeviceStatus = 'provisioned' | 'active' | 'maintenance' | 'decommissioned';
export type SmartLockGrantType = 'resident' | 'technician' | 'temporary' | 'master';
export type SmartLockGrantStatus = 'active' | 'suspended' | 'revoked' | 'expired';
export type SmartLockCredentialType = 'pin' | 'card' | 'fingerprint';
export type SmartLockCredentialStatus = 'creating' | 'active' | 'disabled' | 'expired' | 'deleted' | 'orphaned';
export type SmartLockRestrictionStatus = 'pending_approval' | 'approved' | 'applied' | 'rejected' | 'lifted' | 'cancelled';
export type SmartLockRestrictionReason = 'billing_overdue' | 'manual_admin' | 'security_incident' | 'checkout_completed';
export type SmartLockAlertStatus = 'active' | 'acknowledged' | 'resolved' | 'auto_resolved';
export type SmartLockAlertSeverity = 'info' | 'warning' | 'danger';
export type SmartLockAlertType =
  | 'battery_warning'
  | 'battery_critical'
  | 'device_offline'
  | 'device_online'
  | 'failed_attempts'
  | 'normal_open_mode_active'
  | 'sync_failed';
export type SmartLockAccessAction =
  | 'lock'
  | 'unlock'
  | 'remote_unlock'
  | 'emergency_unlock'
  | 'doorbell_ring'
  | 'failed_attempt'
  | 'sync_status'
  | 'restrict'
  | 'unrestrict'
  | 'normal_open_mode'
  | 'normal_open_mode_on'
  | 'normal_open_mode_off'
  | 'credential_created'
  | 'credential_disabled'
  | 'credential_deleted'
  | 'pin_revealed';
export type SmartLockAccessSource =
  | 'resident_app'
  | 'admin_dashboard'
  | 'auto_lock'
  | 'device'
  | 'system'
  | 'billing_system'
  | 'checkout_workflow'
  | 'maintenance'
  | 'emergency_override';
export type SmartLockAccessResult = 'success' | 'failed' | 'denied' | 'timeout' | 'device_offline' | 'queued';
export type SmartLockAccessTrigger = 'manual' | 'doorbell' | 'auto_lock' | 'schedule' | 'checkout_workflow' | 'restriction_workflow';

export type SmartLockAuditContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type SmartLockDeviceRecord = {
  id: string;
  propertyId: string;
  roomId: string;
  deviceName: string;
  tuyaDeviceId: string;
  model: string | null;
  connectionStatus: SmartLockConnectionStatus;
  lockState: SmartLockState;
  deviceStatus: SmartLockDeviceStatus;
  batteryPercent: number | null;
  autoLockEnabled: boolean;
  autoLockDelaySeconds: number;
  firmwareVersion: string | null;
  normalOpenMode: boolean;
  lastSyncedAt: Date | null;
  lastActivityAt: Date | null;
  commissionedAt: Date | null;
  decommissionedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RegisterSmartLockDeviceInput = {
  propertyId: string;
  roomId: string;
  deviceName: string;
  tuyaDeviceId: string;
  model?: string;
};

export type SmartLockDeviceStatusPatch = {
  deviceName?: string;
  model?: string | null;
  connectionStatus?: SmartLockConnectionStatus;
  lockState?: SmartLockState;
  deviceStatus?: SmartLockDeviceStatus;
  batteryPercent?: number | null;
  firmwareVersion?: string | null;
  normalOpenMode?: boolean;
  autoLockEnabled?: boolean;
  autoLockDelaySeconds?: number;
};

export type SmartLockAccessGrantRecord = {
  id: string;
  propertyId: string;
  smartLockDeviceId: string;
  residentId: string | null;
  userId: string;
  grantType: SmartLockGrantType;
  grantStatus: SmartLockGrantStatus;
  validFrom: Date;
  validUntil: Date | null;
  grantPurpose: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  createdByUserId: string;
  suspendedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSmartLockAccessGrantInput = {
  propertyId: string;
  smartLockDeviceId: string;
  residentId?: string;
  userId: string;
  grantType: SmartLockGrantType;
  validFrom?: Date;
  validUntil?: Date;
  grantPurpose?: string;
  sourceRefType?: string;
  sourceRefId?: string;
  createdByUserId: string;
};

export type SmartLockCredentialRecord = {
  id: string;
  smartLockDeviceId: string;
  accessGrantId: string | null;
  credentialType: SmartLockCredentialType;
  credentialStatus: SmartLockCredentialStatus;
  tuyaCredentialId: string | null;
  credentialLabel: string;
  pinDisplayHash: string | null;
  validFrom: Date;
  validUntil: Date | null;
  fingerIndex: string | null;
  cardNumberMasked: string | null;
  createdByUserId: string;
  disabledAt: Date | null;
  disabledByUserId: string | null;
  disableReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSmartLockCredentialInput = {
  smartLockDeviceId: string;
  accessGrantId?: string;
  credentialType: SmartLockCredentialType;
  credentialLabel: string;
  pinDisplayHash?: string;
  validFrom?: Date;
  validUntil?: Date;
  fingerIndex?: string;
  cardNumberMasked?: string;
  createdByUserId: string;
};

export type SmartLockAccessLogRecord = {
  id: string;
  propertyId: string;
  smartLockDeviceId: string;
  roomId: string;
  residentId: string | null;
  actorUserId: string | null;
  actionType: SmartLockAccessAction;
  source: SmartLockAccessSource;
  trigger: SmartLockAccessTrigger | null;
  resultStatus: SmartLockAccessResult;
  failureReason: string | null;
  credentialTypeUsed: SmartLockCredentialType | 'remote' | 'auto_lock' | null;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
};

export type CreateSmartLockAccessLogInput = Omit<SmartLockAccessLogRecord, 'id' | 'occurredAt'> & {
  occurredAt?: Date;
};

export type SmartLockRestrictionRecord = {
  id: string;
  propertyId: string;
  smartLockDeviceId: string;
  roomId: string;
  residentId: string;
  reasonType: SmartLockRestrictionReason;
  reasonDescription: string;
  reasonRefType: string | null;
  reasonRefId: string | null;
  restrictionStatus: SmartLockRestrictionStatus;
  requestedByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  appliedAt: Date | null;
  liftedAt: Date | null;
  liftedByUserId: string | null;
  liftReason: string | null;
  liftSuggestedAt: Date | null;
  rejectedAt: Date | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSmartLockRestrictionInput = {
  propertyId: string;
  smartLockDeviceId: string;
  roomId: string;
  residentId: string;
  reasonType: SmartLockRestrictionReason;
  reasonDescription: string;
  reasonRefType?: string;
  reasonRefId?: string;
  requestedByUserId: string;
};

export type SmartLockAlertRecord = {
  id: string;
  propertyId: string;
  smartLockDeviceId: string;
  alertType: SmartLockAlertType;
  severity: SmartLockAlertSeverity;
  title: string;
  description: string | null;
  alertStatus: SmartLockAlertStatus;
  alertData: Record<string, unknown> | null;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
};

export type CreateSmartLockAlertInput = {
  propertyId: string;
  smartLockDeviceId: string;
  alertType: SmartLockAlertType;
  severity: SmartLockAlertSeverity;
  title: string;
  description?: string;
  alertData?: Record<string, unknown>;
};
