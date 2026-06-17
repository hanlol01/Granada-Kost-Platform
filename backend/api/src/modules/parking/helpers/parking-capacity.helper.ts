import { BadRequestException } from '@nestjs/common';
import { ParkingCapacitySnapshot } from '../types/parking.types';

export class ParkingCapacityHelper {
  static snapshot(capacity: number, occupied: number): ParkingCapacitySnapshot {
    const available = Math.max(capacity - occupied, 0);
    return {
      capacity,
      occupied,
      available,
      utilizationRate: capacity === 0 ? 0 : occupied / capacity,
    };
  }

  static assertHasCapacity(capacity: number, occupied: number): void {
    if (capacity > 0 && occupied >= capacity) {
      throw new BadRequestException({
        code: 'PARKING_CAPACITY_FULL',
        message: 'Parking capacity is full',
      });
    }
  }
}
