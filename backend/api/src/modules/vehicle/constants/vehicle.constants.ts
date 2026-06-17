export const VEHICLE_AUDIT_ACTIONS = {
  create: 'vehicle.create',
  approve: 'vehicle.approve',
  reject: 'vehicle.reject',
  suspend: 'vehicle.suspend',
  reactivate: 'vehicle.reactivate',
  deactivate: 'vehicle.deactivate',
  update: 'vehicle.update',
} as const;

export const ACTIVE_PLATE_STATUSES = ['pending_approval', 'active', 'suspended', 'transfer_pending'] as const;
