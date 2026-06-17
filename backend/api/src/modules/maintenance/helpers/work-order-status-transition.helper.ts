import { BadRequestException } from '@nestjs/common';
import { StoredWorkOrderStatus } from '../types/maintenance.types';

const ALLOWED_WORK_ORDER_TRANSITIONS: Record<StoredWorkOrderStatus, StoredWorkOrderStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'on_hold', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: ['verified', 'rework_required'],
  rework_required: ['in_progress', 'cancelled'],
  verified: [],
  cancelled: [],
};

export class WorkOrderStatusTransitionHelper {
  static canTransition(fromStatus: StoredWorkOrderStatus, toStatus: StoredWorkOrderStatus): boolean {
    return ALLOWED_WORK_ORDER_TRANSITIONS[fromStatus].includes(toStatus);
  }

  static assertCanTransition(fromStatus: StoredWorkOrderStatus, toStatus: StoredWorkOrderStatus): void {
    if (!this.canTransition(fromStatus, toStatus)) {
      throw new BadRequestException({
        code: 'WORK_ORDER_INVALID_STATUS_TRANSITION',
        message: `Work order cannot transition from ${fromStatus} to ${toStatus}`,
      });
    }
  }

  static nextStatuses(fromStatus: StoredWorkOrderStatus): StoredWorkOrderStatus[] {
    return [...ALLOWED_WORK_ORDER_TRANSITIONS[fromStatus]];
  }
}
