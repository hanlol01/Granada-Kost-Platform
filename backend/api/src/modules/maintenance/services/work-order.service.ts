import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { v2Data, v2List } from '../../../shared/admin-ux-v2';
import { MAINTENANCE_AUDIT_ACTIONS } from '../constants/maintenance.constants';
import { WorkOrderCodeGenerator } from '../helpers/work-order-code-generator';
import { WorkOrderStatusTransitionHelper } from '../helpers/work-order-status-transition.helper';
import { MaintenanceMaterialRepository } from '../repositories/maintenance-material.repository';
import { WorkOrderFileRepository } from '../repositories/work-order-file.repository';
import { WorkOrderHistoryRepository } from '../repositories/work-order-history.repository';
import { WorkOrderRepository } from '../repositories/work-order.repository';
import {
  AuditActorContext,
  AdminWorkOrderResponse,
  CreateMaintenanceMaterialInput,
  CreateWorkOrderFileInput,
  CreateWorkOrderInput,
  MaintenanceMaterialRecord,
  StoredWorkOrderStatus,
  WorkOrderFileRecord,
  WorkOrderRecord,
} from '../types/maintenance.types';
import { TechnicianService } from './technician.service';

type TransitionCommandOptions = {
  authorizedPropertyId?: string;
  idempotencyKey?: string;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
};

@Injectable()
export class WorkOrderService {
  constructor(
    private readonly workOrders: WorkOrderRepository,
    private readonly histories: WorkOrderHistoryRepository,
    private readonly files: WorkOrderFileRepository,
    private readonly materials: MaintenanceMaterialRepository,
    private readonly technicians: TechnicianService,
    private readonly audit: AuditRepository,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  list(
    propertyId: string,
    status?: StoredWorkOrderStatus,
    limit?: number,
    offset?: number,
  ): Promise<WorkOrderRecord[]> {
    return this.workOrders.list(propertyId, status, limit, offset);
  }

  async listAdmin(
    propertyIds: string[],
    status: StoredWorkOrderStatus | undefined,
    limit: number,
    offset: number,
  ) {
    const page = await this.workOrders.listPage(propertyIds, status, limit, offset);
    return v2List(
      page.records.map((record) => this.toAdminResponse(record)),
      limit,
      offset,
      page.total,
    );
  }

  listAssigned(
    userId: string,
    status?: StoredWorkOrderStatus,
    limit?: number,
    offset?: number,
  ): Promise<WorkOrderRecord[]> {
    return this.workOrders.listAssigned(userId, status, limit, offset);
  }

  async get(workOrderId: string): Promise<WorkOrderRecord> {
    const workOrder = await this.workOrders.findById(workOrderId);
    if (!workOrder) {
      throw new NotFoundException({
        code: 'WORK_ORDER_NOT_FOUND',
        message: 'Work order not found',
      });
    }
    return workOrder;
  }

  async getAssigned(workOrderId: string, userId: string): Promise<WorkOrderRecord> {
    const workOrder = await this.workOrders.findByIdAssigned(workOrderId, userId);
    if (!workOrder) {
      throw new NotFoundException({
        code: 'WORK_ORDER_NOT_FOUND',
        message: 'Work order not found',
      });
    }
    return workOrder;
  }

  async createWorkOrder(
    input: CreateWorkOrderInput,
    context: AuditActorContext = {},
  ): Promise<WorkOrderRecord> {
    if (input.complaintId) {
      throw new BadRequestException({
        code: 'COMPLAINT_WORK_ORDER_REQUIRES_DISPATCH',
        message: 'Complaint-linked work orders must be created through complaint assignment',
      });
    }
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

  adminDetail(workOrder: WorkOrderRecord) {
    return v2Data(this.toAdminResponse(workOrder));
  }

  async generateCode(propertyCode: string, propertyId: string, date = new Date()): Promise<string> {
    const sequence = await this.workOrders.nextSequence(propertyId, date.getFullYear());
    return WorkOrderCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  async assign(
    workOrderId: string,
    technicianUserId: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    const current = await this.get(workOrderId);
    await this.technicians.ensureActive(current.propertyId, technicianUserId);
    return this.transition(workOrderId, 'assigned', MAINTENANCE_AUDIT_ACTIONS.assign, context, {
      assignedToUserId: technicianUserId,
      notes: 'Work order assigned',
      ...mutation,
    });
  }

  start(
    workOrderId: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'in_progress', MAINTENANCE_AUDIT_ACTIONS.start, context, {
      notes: 'Work order started',
      ...mutation,
    });
  }

  complete(
    workOrderId: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'completed', MAINTENANCE_AUDIT_ACTIONS.complete, context, {
      notes: 'Work order completed',
      ...mutation,
    });
  }

  verify(
    workOrderId: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'verified', MAINTENANCE_AUDIT_ACTIONS.verify, context, {
      verifiedByUserId: context.actorUserId,
      notes: 'Work order verified',
      ...mutation,
    });
  }

  rework(
    workOrderId: string,
    reason: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    return this.transition(
      workOrderId,
      'rework_required',
      MAINTENANCE_AUDIT_ACTIONS.rework,
      context,
      {
        reworkReason: reason,
        notes: reason,
        ...mutation,
      },
    );
  }

  cancel(
    workOrderId: string,
    reason: string,
    context: AuditActorContext = {},
    mutation: TransitionCommandOptions = {},
  ): Promise<WorkOrderRecord> {
    return this.transition(workOrderId, 'cancelled', MAINTENANCE_AUDIT_ACTIONS.cancel, context, {
      cancelReason: reason,
      notes: reason,
      ...mutation,
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
      authorizedPropertyId?: string;
      idempotencyKey?: string;
      notes?: string;
    } = {},
  ): Promise<WorkOrderRecord> {
    if (!options.idempotencyKey) {
      const current = await this.get(workOrderId);
      WorkOrderStatusTransitionHelper.assertCanTransition(current.workOrderStatus, toStatus);

      const updated = await this.workOrders.transitionStatus(current.id, toStatus, options);
      if (!updated) {
        throw new BadRequestException({
          code: 'WORK_ORDER_TRANSITION_FAILED',
          message: 'Work order transition failed',
        });
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

    if (!this.database) {
      throw new BadRequestException({
        code: 'WORK_ORDER_COMMAND_UNAVAILABLE',
        message: 'Work-order command authority is unavailable',
      });
    }
    const actorUserId = context.actorUserId;
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'WORK_ORDER_ACTOR_REQUIRED',
        message: 'Authenticated actor is required',
      });
    }
    const idempotencyKey = this.requireIdempotencyKey(options.idempotencyKey);
    const action = auditAction.replace(/^work_order\./, '');
    const route = `/api/v1/work-orders/:workOrderId/${action}`;
    const fingerprint = this.requestFingerprint({
      work_order_id: workOrderId,
      property_id: options.authorizedPropertyId,
      actor_user_id: actorUserId,
      to_status: toStatus,
      assigned_to_user_id: options.assignedToUserId ?? null,
      rework_reason: options.reworkReason ?? null,
      cancel_reason: options.cancelReason ?? null,
    });

    return this.database.transaction(async (client) => {
      const current = await this.workOrders.findByIdForUpdate(workOrderId, client);
      if (!current) {
        throw new NotFoundException({
          code: 'WORK_ORDER_NOT_FOUND',
          message: 'Work order not found',
        });
      }
      if (options.authorizedPropertyId && current.propertyId !== options.authorizedPropertyId) {
        throw new ForbiddenException({
          code: 'PROPERTY_SCOPE_DENIED',
          message: 'Property scope denied',
        });
      }
      const replay = await this.claimCommand(
        client,
        current.propertyId,
        actorUserId,
        route,
        idempotencyKey,
        fingerprint,
        context.correlationId,
      );
      if (replay) {
        return (replay as { data: WorkOrderRecord }).data;
      }

      WorkOrderStatusTransitionHelper.assertCanTransition(current.workOrderStatus, toStatus);
      const updated = await this.workOrders.transitionStatus(current.id, toStatus, options, client);
      if (!updated) {
        throw new BadRequestException({
          code: 'WORK_ORDER_TRANSITION_FAILED',
          message: 'Work order transition failed',
        });
      }
      await this.histories.record(
        {
          workOrderId: updated.id,
          fromStatus: current.workOrderStatus,
          toStatus,
          actorUserId,
          notes: options.notes,
        },
        client,
      );
      await this.writeWorkOrderAudit(auditAction, updated, context, current, client);
      await this.writeOutbox(client, {
        propertyId: updated.propertyId,
        eventKey: `work_order.status_changed:${updated.id}:${idempotencyKey}`,
        eventType: 'work_order.status_changed',
        aggregateId: updated.id,
        payload: {
          work_order_id: updated.id,
          complaint_id: updated.complaintId,
          from_status: current.workOrderStatus,
          to_status: updated.workOrderStatus,
          priority: updated.priority,
          room_id: updated.roomId,
        },
        correlationId: context.correlationId,
        actorUserId,
      });
      await this.completeTransitionCommand(client, actorUserId, route, idempotencyKey, updated);
      return updated;
    });
  }

  private async writeWorkOrderAudit(
    action: string,
    workOrder: WorkOrderRecord,
    context: AuditActorContext,
    before?: WorkOrderRecord,
    client?: PoolClient,
  ): Promise<void> {
    await this.audit.write(
      {
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
      },
      client,
    );
  }

  private async claimCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    idempotencyKey: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<Record<string, unknown> | null> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_status, response_body`,
      [propertyId, actorUserId, route, idempotencyKey, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row || row.command_status === 'pending' || !row.response_body) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no replayable result',
      });
    }
    if (row.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    if (row.command_status !== 'succeeded' || row.response_status !== 200) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'Idempotency command has no successful replayable result',
      });
    }
    return row.response_body;
  }

  private async completeTransitionCommand(
    client: PoolClient,
    actorUserId: string,
    route: string,
    idempotencyKey: string,
    workOrder: WorkOrderRecord,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = 'succeeded', response_status = 200, response_body = $4::jsonb,
           resource_type = 'maintenance_work_order', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorUserId, route, idempotencyKey, JSON.stringify({ data: workOrder }), workOrder.id],
    );
  }

  private async writeOutbox(
    client: PoolClient,
    input: {
      propertyId: string;
      eventKey: string;
      eventType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      correlationId?: string;
      actorUserId?: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, 'maintenance_work_order', $4, $5::jsonb, $6, $7)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateId,
        JSON.stringify(input.payload),
        input.correlationId ?? null,
        input.actorUserId ?? null,
      ],
    );
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    if (key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be 16 to 128 characters',
      });
    }
    return key;
  }

  private requestFingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

  toAdminResponse(workOrder: WorkOrderRecord): AdminWorkOrderResponse {
    return {
      id: workOrder.id,
      propertyId: workOrder.propertyId,
      roomId: workOrder.roomId,
      complaintId: workOrder.complaintId,
      workOrderCode: workOrder.workOrderCode,
      priority: workOrder.priority,
      status: workOrder.workOrderStatus,
      assignedToUserId: workOrder.assignedToUserId,
      scheduledAt: workOrder.scheduledAt,
      startedAt: workOrder.startedAt,
      completedAt: workOrder.completedAt,
      verifiedAt: workOrder.verifiedAt,
      createdAt: workOrder.createdAt,
      updatedAt: workOrder.updatedAt,
    };
  }
}
