import { Injectable } from '@nestjs/common';
import { WorkOrderRecord } from '../types/maintenance.types';
import { TechnicianService } from './technician.service';
import { WorkOrderService } from './work-order.service';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly workOrders: WorkOrderService,
    private readonly technicians: TechnicianService,
  ) {}

  listOpenWork(propertyId: string): Promise<WorkOrderRecord[]> {
    return this.workOrders.list(propertyId, undefined, 50, 0);
  }

  async technicianWorkload(propertyId: string): Promise<Array<{ userId: string; activeWorkOrders: number }>> {
    const technicians = await this.technicians.list(propertyId, true);
    const workloads = await Promise.all(
      technicians.map(async (technician) => {
        const assigned = await this.workOrders.listAssigned(technician.userId, 'assigned', 100, 0);
        const inProgress = await this.workOrders.listAssigned(technician.userId, 'in_progress', 100, 0);
        return {
          userId: technician.userId,
          activeWorkOrders: assigned.length + inProgress.length,
        };
      }),
    );
    return workloads;
  }
}
