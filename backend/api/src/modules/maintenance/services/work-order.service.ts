import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { MAINTENANCE_AUDIT_ACTIONS } from '../constants/maintenance.constants';
import { WorkOrderCodeGenerator } from '../helpers/work-order-code-generator';
import { WorkOrderStatusTransitionHelper } from '../helpers/work-order-status-transition.helper';
import { MaintenanceMaterialRepository } from '../repositories/maintenance-material.repository';
import { WorkOrderFileRepository } from '../repositories/work-order-file.repository';
import { WorkOrderHistoryRepository } from '../repositories/work-order-history.repository';
import { WorkOrderRepository } from '../repositories/work-order.repository';
import {
  AuditActorContext,
  CreateMaintenanceMaterialInput,
  CreateWorkOrderFileInput,
  CreateWorkOrderInput,
  MaintenanceMaterialRecord,
  StoredWorkOrderStatus,
  WorkOrderFileRecord,
  WorkOrderRecord,
} from '../types/maintenance.types';
import { TechnicianService } from './technician.service';

@Injectable()
export class WorkOrderService {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly histories: WorkOrderHistoryRepository,
    private readonly files: WorkOrderFileRepository,
    private readonly materials: MaintenanceMaterialRepository,
    private readonly technicians: TechnicianService,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, status?: StoredWorkOrderStatus, limit?: number, offset?: number): Promise<WorkOrderRecord[]> {
    return this.workOrders.list(propertyId, status, limit, offset);
  }

  listAssigned(userId: string, status?: StoredWorkOrderStatus, limit?: number, offset?: number): Promise<WorkOrderRecord[]> {
    return this.workOrders.listAssigned(userId, status, limit, offset);
  }

  async get(workOrderId: string): Promise<WorkOrderRecord> {
    const workOrder = await this.workOrders.findById(workOrderId);
    if (!workOrder) {
      throw new NotFoundException({ code: 'WORK_ORDER_NOT_FOUND', message: 'Work order not found' });
    }
    return workOrder;
  }

  async getAssigned(workOrderId: string, userId: string): Promise<WorkOrderRecord> {
    const workOrder = await this.workOrders.findByIdAssigned(workOrderId, userId);
    if (!workOrder) {
      throw new NotFoundException({ code: 'WORK_ORDER_NOT_FOUND', message: 'Work order not found' });
    }
    return workOrder;
  }

  async createWorkOrder(input: CreateWorkOrderInput, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    const workOrder = await this.workOrders.create(input);
    await this.histories.record({
      workOrderId: workOrder.id,
      fromStatus: 'open',
      toStatus: 'open',
      actorUserId: context.actorUserId,
      notes: 'Work order created',
    });
    await this.writeWorkOrderAudit(MAINTENANCE_AUDIT_ACTIONS.create, workOrder, context);
    return workOrder;
  }

  async generateCode(propertyCode: string, propertyId: string, date = new Date()): Promise<string> {
    const sequence = await this.workOrders.nextSequence(propertyId, date.getFullYear());
    return WorkOrderCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  async assign(workOrderId: string, technicianUserId: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    const current = await this.get(workOrderId);
    await this.technicians.ensureActive(current.propertyId, technicianUserId);
    return this.transition(workOrderId, 'assigned', MAINTENANCE_AUDIT_ACTIONS.assign, context, {
      assignedToUserId: technicianUserId,
      notes: 'Work order assigned',
    });
  }

  start(workOrderId: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'in_progress', MAINTENANCE_AUDIT_ACTIONS.start, context, {
      notes: 'Work order started',
    });
  }

  complete(workOrderId: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'completed', MAINTENANCE_AUDIT_ACTIONS.complete, context, {
      notes: 'Work order completed',
    });
  }

  verify(workOrderId: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'verified', MAINTENANCE_AUDIT_ACTIONS.verify, context, {
      verifiedByUserId: context.actorUserId,
      notes: 'Work order verified',
    });
  }

  rework(workOrderId: string, reason: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'rework_required', MAINTENANCE_AUDIT_ACTIONS.rework, context, {
      reworkReason: reason,
      notes: reason,
    });
  }

  cancel(workOrderId: string, reason: string, context: AuditActorContext = {}): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'cancelled', MAINTENANCE_AUDIT_ACTIONS.cancel, context, {
      cancelReason: reason,
      notes: reason,
    });
  }

  attachFile(input: CreateWorkOrderFileInput): Promise<WorkOrderFileRecord> {
    return this.files.attach(input);
  }

  listFiles(workOrderId: string): Promise<WorkOrderFileRecord[]> {
    return this.files.list(workOrderId);
  }

  addMaterial(input: CreateMaintenanceMaterialInput): Promise<MaintenanceMaterialRecord> {
    return this.materials.add(input);
  }

  listMaterials(workOrderId: string): Promise<MaintenanceMaterialRecord[]> {
    return this.materials.list(workOrderId);
  }

  private async transition(
    workOrderId: string,
    toStatus: StoredWorkOrderStatus,
    auditAction: string,
    context: AuditActorContext,
    options: {
      assignedToUserId?: string;
      verifiedByUserId?: string;
      reworkReason?: string;
      cancelReason?: string;
      notes?: string;
    } = {},
  ): Promise<WorkOrderRecord> {
    const current = await this.get(workOrderId);
    WorkOrderStatusTransitionHelper.assertCanTransition(current.workOrderStatus, toStatus);

    const updated = await this.workOrders.transitionStatus(current.id, toStatus, options);
    if (!updated) {
      throw new BadRequestException({ code: 'WORK_ORDER_TRANSITION_FAILED', message: 'Work order transition failed' });
    }

    await this.histories.record({
      workOrderId: updated.id,
      fromStatus: current.workOrderStatus,
      toStatus,
      actorUserId: context.actorUserId,
      notes: options.notes,
    });
    await this.writeWorkOrderAudit(auditAction, updated, context, current);
    return updated;
  }

  private async writeWorkOrderAudit(
    action: string,
    workOrder: WorkOrderRecord,
    context: AuditActorContext,
    before?: WorkOrderRecord,
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: workOrder.propertyId,
      action,
      resourceType: 'maintenance_work_order',
      resourceId: workOrder.id,
      beforeData: before ? this.auditSnapshot(before) : undefined,
      afterData: this.auditSnapshot(workOrder),
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }

  private auditSnapshot(workOrder: WorkOrderRecord): Record<string, unknown> {
    return {
      id: workOrder.id,
      workOrderCode: workOrder.workOrderCode,
      workOrderStatus: workOrder.workOrderStatus,
      priority: workOrder.priority,
      roomId: workOrder.roomId,
      complaintId: workOrder.complaintId,
      assignedToUserId: workOrder.assignedToUserId,
    };
  }
}
