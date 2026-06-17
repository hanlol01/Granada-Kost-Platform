import { BadRequestException } from '@nestjs/common';
import { StoredComplaintStatus } from '../types/complaint.types';

const ALLOWED_COMPLAINT_TRANSITIONS: Record<StoredComplaintStatus, StoredComplaintStatus[]> = {
  submitted: ['acknowledged', 'cancelled'],
  acknowledged: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'on_hold', 'escalated', 'cancelled'],
  on_hold: ['in_progress', 'escalated', 'cancelled'],
  escalated: ['in_progress', 'resolved', 'cancelled'],
  resolved: ['closed', 'reopened'],
  reopened: ['in_progress', 'escalated', 'cancelled'],
  closed: [],
  cancelled: [],
};

export class ComplaintStatusTransitionHelper {
  static canTransition(fromStatus: StoredComplaintStatus, toStatus: StoredComplaintStatus): boolean {
    return ALLOWED_COMPLAINT_TRANSITIONS[fromStatus].includes(toStatus);
  }

  static assertCanTransition(fromStatus: StoredComplaintStatus, toStatus: StoredComplaintStatus): void {
    if (!this.canTransition(fromStatus, toStatus)) {
      throw new BadRequestException({
        code: 'COMPLAINT_INVALID_STATUS_TRANSITION',
        message: `Complaint cannot transition from ${fromStatus} to ${toStatus}`,
      });
    }
  }

  static nextStatuses(fromStatus: StoredComplaintStatus): StoredComplaintStatus[] {
    return [...ALLOWED_COMPLAINT_TRANSITIONS[fromStatus]];
  }
}
