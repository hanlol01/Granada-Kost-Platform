import { StoredWorkOrderStatus, WorkOrderStatus } from '../types/maintenance.types';

export const WORK_ORDER_STATUSES: StoredWorkOrderStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'on_hold',
  'completed',
  'verified',
  'rework_required',
  'cancelled',
];

export const WORK_ORDER_WORKFLOW_ACTIONS = {
  create: 'open',
  assign: 'assigned',
  start: 'in_progress',
  hold: 'on_hold',
  complete: 'completed',
  verify: 'verified',
  rework: 'rework_required',
  cancel: 'cancelled',
} as const satisfies Record<string, WorkOrderStatus>;

export const MAINTENANCE_AUDIT_ACTIONS = {
  create: 'work_order.create',
  assign: 'work_order.assign',
  start: 'work_order.start',
  complete: 'work_order.complete',
  verify: 'work_order.verify',
  rework: 'work_order.rework',
  cancel: 'work_order.cancel',
} as const;
