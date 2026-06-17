import { BadRequestException } from '@nestjs/common';
import { VehicleStatus } from '../types/vehicle.types';

const allowedTransitions: Record<VehicleStatus, VehicleStatus[]> = {
  pending_approval: ['active', 'rejected'],
  active: ['suspended', 'transfer_pending', 'inactive'],
  rejected: [],
  suspended: ['active', 'inactive'],
  transfer_pending: ['active', 'inactive'],
  inactive: [],
};

export class VehicleStatusTransitionHelper {
  static canTransition(fromStatus: VehicleStatus, toStatus: VehicleStatus): boolean {
    return allowedTransitions[fromStatus].includes(toStatus);
  }

  static assertCanTransition(fromStatus: VehicleStatus, toStatus: VehicleStatus): void {
    if (!this.canTransition(fromStatus, toStatus)) {
      throw new BadRequestException({
        code: 'INVALID_VEHICLE_STATUS_TRANSITION',
        message: `Vehicle cannot transition from ${fromStatus} to ${toStatus}`,
      });
    }
  }
}
