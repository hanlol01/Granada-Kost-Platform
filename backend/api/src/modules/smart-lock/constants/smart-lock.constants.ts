export const SMART_LOCK_DEFAULTS = {
  gracePeriodHours: 24,
  deviceSyncIntervalSeconds: 5 * 60,
  commandRateLimitWindowSeconds: 60,
  commandRateLimitMaxAttempts: 10,
  pinLength: 6,
} as const;

export const SMART_LOCK_AUDIT_ACTIONS = {
  deviceRegister: 'smart_lock.device.register',
  deviceStatusSync: 'smart_lock.device.status_sync',
  lock: 'smart_lock.lock',
  unlock: 'smart_lock.unlock',
  remoteUnlock: 'smart_lock.remote_unlock',
  emergencyUnlock: 'smart_lock.emergency_unlock',
  accessGrantCreate: 'smart_lock.access_grant.create',
  accessGrantRevoke: 'smart_lock.access_grant.revoke',
  credentialCreate: 'smart_lock.credential.create',
  credentialDisable: 'smart_lock.credential.disable',
  credentialReEnable: 'smart_lock.credential.re_enable',
  credentialDelete: 'smart_lock.credential.delete',
  restrictionRequest: 'smart_lock.restriction.request',
  restrictionApprove: 'smart_lock.restriction.approve',
  restrictionApply: 'smart_lock.restriction.apply',
  restrictionReject: 'smart_lock.restriction.reject',
  restrictionLift: 'smart_lock.restriction.lift',
  restrictionCancel: 'smart_lock.restriction.cancel',
  doorbellRing: 'smart_lock.doorbell_ring',
  failedAttempt: 'smart_lock.failed_attempt',
  normalOpenModeToggle: 'smart_lock.normal_open_mode.toggle',
  deviceDecommission: 'smart_lock.device.decommission',
  alertAcknowledge: 'smart_lock.alert.acknowledge',
  alertResolve: 'smart_lock.alert.resolve',
} as const;

export const SMART_LOCK_COMMAND_ROLES = {
  normalOpenMode: ['owner', 'manager'],
  propertyOwnerDenied: ['property_owner'],
} as const;
