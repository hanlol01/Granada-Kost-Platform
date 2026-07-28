import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { FileRepository } from '../../file/file.repository';
import type { FileRecord } from '../../file/types/file.types';
import { TechnicianProfileRepository } from '../../maintenance/repositories/technician-profile.repository';
import { WorkOrderHistoryRepository } from '../../maintenance/repositories/work-order-history.repository';
import { WorkOrderRepository } from '../../maintenance/repositories/work-order.repository';
import { WorkOrderCodeGenerator } from '../../maintenance/helpers/work-order-code-generator';
import {
  AdminMaintenanceDispatchResponse,
  WorkOrderRecord,
} from '../../maintenance/types/maintenance.types';
import { COMPLAINT_AUDIT_ACTIONS } from '../constants/complaint.constants';
import { ComplaintCodeGenerator } from '../helpers/complaint-code-generator';
import { SlaCalculationHelper } from '../helpers/sla-calculation.helper';
import { ComplaintStatusTransitionHelper } from '../helpers/complaint-status-transition.helper';
import { ComplaintFileRepository } from '../repositories/complaint-file.repository';
import { ComplaintHistoryRepository } from '../repositories/complaint-history.repository';
import { ComplaintRepository } from '../repositories/complaint.repository';
import {
  AuditActorContext,
  ComplaintFileRecord,
  ComplaintRecord,
  ComplaintSummaryRecord,
  CreateComplaintFileInput,
  CreateComplaintInput,
  StoredComplaintStatus,
} from '../types/complaint.types';

type DispatchOptions = {
  authorizedPropertyId: string;
  v2: boolean;
  idempotencyKey?: string;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
};

const DISPATCHABLE_COMPLAINT_STATUSES: StoredComplaintStatus[] = [
  'submitted',
  'acknowledged',
  'in_progress',
  'on_hold',
  'escalated',
  'reopened',
];

const INITIAL_DISPATCH_COMPLAINT_STATUSES: StoredComplaintStatus[] = [
  'submitted',
  'acknowledged',
  'reopened',
];

const ACTIONABLE_WORK_ORDER_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'on_hold',
  'completed',
  'rework_required',
] as const;

@Injectable()
export class ComplaintService {
  constructor(
    private readonly complaints: ComplaintRepository,
    private readonly histories: ComplaintHistoryRepository,
    private readonly complaintFiles: ComplaintFileRepository,
    private readonly files: FileRepository,
    private readonly audit: AuditRepository,
    private readonly database: DatabaseService,
    private readonly technicians: TechnicianProfileRepository,
    private readonly workOrders: WorkOrderRepository,
    private readonly workOrderHistories: WorkOrderHistoryRepository,
  ) {}

  list(
    propertyId: string,
    status?: StoredComplaintStatus,
    limit?: number,
    offset?: number,
  ): Promise<ComplaintRecord[]> {
    return this.complaints.list(propertyId, status, limit, offset);
  }

  listForProperties(
    propertyIds: string[],
    status?: StoredComplaintStatus,
    limit?: number,
    offset?: number,
  ): Promise<ComplaintRecord[]> {
    return this.complaints.listForProperties(propertyIds, status, limit, offset);
  }

  listForResident(residentId: string, limit?: number, offset?: number): Promise<ComplaintRecord[]> {
    return this.complaints.listForResident(residentId, limit, offset);
  }

  listForUser(userId: string, limit?: number, offset?: number): Promise<ComplaintRecord[]> {
    return this.complaints.listForUser(userId, limit, offset);
  }

  async get(complaintId: string): Promise<ComplaintRecord> {
    const complaint = await this.complaints.findById(complaintId);
    if (!complaint) {
      throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND', message: 'Complaint not found' });
    }
    return complaint;
  }

  async getForUser(complaintId: string, userId: string): Promise<ComplaintRecord> {
    const complaint = await this.complaints.findByIdForUser(complaintId, userId);
    if (!complaint) {
      throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND', message: 'Complaint not found' });
    }
    return complaint;
  }

  async activeResidentContextForUser(userId: string) {
    const context = await this.complaints.activeContextForUser(userId);
    if (!context) {
      throw new BadRequestException({
        code: 'ACTIVE_OCCUPANCY_NOT_FOUND',
        message: 'Active occupancy not found for resident',
      });
    }
    return context;
  }

  async createComplaint(
    input: CreateComplaintInput,
    context: AuditActorContext = {},
  ): Promise<ComplaintRecord> {
    await this.assertResidentCreateContext(input);
    const fileIds = this.normalizeFileIds(input.fileIds);
    await this.validateComplaintAttachmentFiles(fileIds, input);

    if (fileIds.length > 0) {
      return this.createComplaintWithAttachments(input, fileIds, context);
    }

    const complaint = await this.complaints.create(input);
    await this.histories.record({
      complaintId: complaint.id,
      fromStatus: 'submitted',
      toStatus: 'submitted',
      actorUserId: context.actorUserId,
      label: 'Complaint submitted',
    });
    await this.writeComplaintAudit(COMPLAINT_AUDIT_ACTIONS.create, complaint, context, undefined, {
      fileIds,
    });
    return complaint;
  }

  private async createComplaintWithAttachments(
    input: CreateComplaintInput,
    fileIds: string[],
    context: AuditActorContext,
  ): Promise<ComplaintRecord> {
    const client = await this.database.client.connect();
    let complaint: ComplaintRecord;

    try {
      await client.query('BEGIN');

      complaint = await this.complaints.create(input, client);
      await this.histories.record(
        {
          complaintId: complaint.id,
          fromStatus: 'submitted',
          toStatus: 'submitted',
          actorUserId: context.actorUserId,
          label: 'Complaint submitted',
        },
        client,
      );

      for (const fileId of fileIds) {
        await this.complaintFiles.attach(
          {
            complaintId: complaint.id,
            fileId,
            uploadedByUserId: input.createdByUserId,
          },
          client,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await this.writeComplaintAudit(COMPLAINT_AUDIT_ACTIONS.create, complaint, context, undefined, {
      fileIds,
    });
    await this.writeComplaintAudit(
      COMPLAINT_AUDIT_ACTIONS.fileAttach,
      complaint,
      context,
      undefined,
      { fileIds },
    );
    return complaint;
  }

  async generateCode(propertyName: string, propertyId: string, date = new Date()): Promise<string> {
    const propertyCode = ComplaintCodeGenerator.propertyCode(propertyName);
    const sequence = await this.complaints.nextSequence(propertyId, date.getFullYear());
    return ComplaintCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  acknowledge(complaintId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(
      complaintId,
      'acknowledged',
      COMPLAINT_AUDIT_ACTIONS.acknowledge,
      context,
      {
        label: 'Complaint acknowledged',
      },
    );
  }

  async assign(
    complaintId: string,
    assignedToUserId: string,
    context: AuditActorContext,
    options: DispatchOptions,
  ): Promise<ComplaintRecord | { data: AdminMaintenanceDispatchResponse }> {
    const actorUserId = context.actorUserId;
    if (!actorUserId) {
      throw new ForbiddenException({
        code: 'DISPATCH_ACTOR_REQUIRED',
        message: 'Authenticated actor is required',
      });
    }
    const idempotencyKey = options.v2
      ? this.requireIdempotencyKey(options.idempotencyKey)
      : undefined;
    const route = '/api/v1/complaints/:complaintId/assign';
    const fingerprint = this.requestFingerprint({
      route,
      actor_user_id: actorUserId,
      property_id: options.authorizedPropertyId,
      complaint_id: complaintId,
      assigned_to_user_id: assignedToUserId,
    });

    return this.database.transaction(async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended('maintenance_dispatch:' || $1::text, 0)
         )`,
        [complaintId],
      );
      const currentComplaint = await this.complaints.findByIdForUpdate(complaintId, client);
      if (!currentComplaint) {
        throw new NotFoundException({
          code: 'COMPLAINT_NOT_FOUND',
          message: 'Complaint not found',
        });
      }
      if (currentComplaint.propertyId !== options.authorizedPropertyId) {
        throw new ForbiddenException({
          code: 'PROPERTY_SCOPE_DENIED',
          message: 'Property scope denied',
        });
      }
      if (idempotencyKey) {
        const replay = await this.claimCommand(
          client,
          currentComplaint.propertyId,
          actorUserId,
          route,
          idempotencyKey,
          fingerprint,
          context.correlationId,
        );
        if (replay) {
          return replay as { data: AdminMaintenanceDispatchResponse };
        }
      }

      if (!DISPATCHABLE_COMPLAINT_STATUSES.includes(currentComplaint.complaintStatus)) {
        throw new BadRequestException({
          code: 'COMPLAINT_NOT_DISPATCHABLE',
          message: 'Complaint status does not allow maintenance dispatch',
        });
      }

      const technician = await this.technicians.lockActive(
        currentComplaint.propertyId,
        assignedToUserId,
        client,
      );
      if (!technician) {
        throw new BadRequestException({
          code: 'TECHNICIAN_NOT_ACTIVE',
          message: 'Technician is not active for this property',
        });
      }

      const linkedWorkOrders = await this.workOrders.lockByComplaint(complaintId, client);
      const actionable = linkedWorkOrders.filter((workOrder) =>
        ACTIONABLE_WORK_ORDER_STATUSES.includes(
          workOrder.workOrderStatus as (typeof ACTIONABLE_WORK_ORDER_STATUSES)[number],
        ),
      );
      if (actionable.length > 1) {
        throw new ConflictException({
          code: 'COMPLAINT_WORK_ORDER_INVARIANT_VIOLATION',
          message: 'Complaint has more than one actionable work order',
        });
      }

      const currentWorkOrder = actionable[0];
      if (currentWorkOrder?.workOrderStatus === 'completed') {
        throw new ConflictException({
          code: 'WORK_ORDER_COMPLETED_REASSIGNMENT_DENIED',
          message: 'Completed work order must be verified or moved to rework before reassignment',
        });
      }

      const complaintNeedsUpdate =
        currentComplaint.assignedToUserId !== assignedToUserId ||
        INITIAL_DISPATCH_COMPLAINT_STATUSES.includes(currentComplaint.complaintStatus);
      const workOrderNeedsUpdate =
        currentWorkOrder !== undefined &&
        (currentWorkOrder.assignedToUserId !== assignedToUserId ||
          currentWorkOrder.workOrderStatus === 'open');

      let workOrder: WorkOrderRecord;
      if (!currentWorkOrder) {
        const dispatchYear = new Date().getFullYear();
        const codeAllocation = await this.workOrders.allocateDispatchCode(
          currentComplaint.propertyId,
          dispatchYear,
          client,
        );
        workOrder = await this.workOrders.createDispatch(
          {
            propertyId: currentComplaint.propertyId,
            roomId: currentComplaint.roomId ?? undefined,
            complaintId: currentComplaint.id,
            workOrderCode: WorkOrderCodeGenerator.format(
              ComplaintCodeGenerator.propertyCode(codeAllocation.propertyName),
              dispatchYear,
              codeAllocation.sequence,
            ),
            title: currentComplaint.title,
            description: currentComplaint.description,
            priority: currentComplaint.priority,
            assignedToUserId,
            createdByUserId: actorUserId,
          },
          client,
        );
      } else if (workOrderNeedsUpdate) {
        const reassigned = await this.workOrders.reassignForDispatch(
          currentWorkOrder.id,
          assignedToUserId,
          client,
        );
        if (!reassigned) {
          throw new ConflictException({
            code: 'WORK_ORDER_REASSIGNMENT_CONFLICT',
            message: 'Work order can no longer be reassigned',
          });
        }
        workOrder = reassigned;
      } else {
        workOrder = currentWorkOrder;
      }

      let complaint = currentComplaint;
      if (complaintNeedsUpdate) {
        const updated = await this.complaints.assignForDispatch(
          currentComplaint.id,
          assignedToUserId,
          client,
        );
        if (!updated) {
          throw new ConflictException({
            code: 'COMPLAINT_DISPATCH_CONFLICT',
            message: 'Complaint can no longer be dispatched',
          });
        }
        complaint = updated;
        await this.histories.record(
          {
            complaintId: complaint.id,
            fromStatus: currentComplaint.complaintStatus,
            toStatus: complaint.complaintStatus,
            actorUserId,
            label: 'Complaint assigned to maintenance',
          },
          client,
        );
        await this.writeComplaintAudit(
          COMPLAINT_AUDIT_ACTIONS.assign,
          complaint,
          context,
          currentComplaint,
          {},
          client,
        );
      }

      if (!currentWorkOrder || workOrderNeedsUpdate) {
        await this.workOrderHistories.record(
          {
            workOrderId: workOrder.id,
            fromStatus: currentWorkOrder?.workOrderStatus ?? 'open',
            toStatus: workOrder.workOrderStatus,
            actorUserId,
            notes: currentWorkOrder
              ? 'Work order technician reassigned'
              : 'Work order created from complaint dispatch',
          },
          client,
        );
        await this.writeDispatchWorkOrderAudit(
          currentWorkOrder ? 'work_order.assign' : 'work_order.create',
          workOrder,
          context,
          currentWorkOrder,
          client,
        );
      }

      if (!options.v2) {
        return complaint;
      }
      const body = JSON.parse(
        JSON.stringify({ data: this.dispatchResponse(complaint, workOrder) }),
      ) as { data: AdminMaintenanceDispatchResponse };
      await this.completeCommand(client, actorUserId, route, idempotencyKey!, body, workOrder.id);
      return body;
    });
  }

  resolve(complaintId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'resolved', COMPLAINT_AUDIT_ACTIONS.resolve, context, {
      label: 'Complaint resolved',
    });
  }

  close(complaintId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'closed', COMPLAINT_AUDIT_ACTIONS.close, context, {
      label: 'Complaint closed',
    });
  }

  reopen(complaintId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'reopened', COMPLAINT_AUDIT_ACTIONS.reopen, context, {
      label: 'Complaint reopened',
    });
  }

  cancel(
    complaintId: string,
    reason: string,
    context: AuditActorContext = {},
  ): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'cancelled', COMPLAINT_AUDIT_ACTIONS.cancel, context, {
      cancelReason: reason,
      label: 'Complaint cancelled',
      notes: reason,
    });
  }

  async attachFile(input: CreateComplaintFileInput): Promise<ComplaintFileRecord> {
    return this.complaintFiles.attach(input);
  }

  listFiles(complaintId: string): Promise<ComplaintFileRecord[]> {
    return this.complaintFiles.list(complaintId);
  }

  /** Returns file records for a complaint's attachments (resolves through junction). */
  async listFileRecords(complaintId: string): Promise<FileRecord[]> {
    const junctions = await this.complaintFiles.list(complaintId);
    const records: FileRecord[] = [];
    for (const junction of junctions) {
      const file = await this.files.findById(junction.fileId);
      if (file && !file.isDeleted) {
        records.push(file);
      }
    }
    return records;
  }

  async refreshSlaFlags(complaintId: string, comparedAt = new Date()): Promise<ComplaintRecord> {
    const complaint = await this.get(complaintId);
    const flags = SlaCalculationHelper.breachStatus(
      complaint.priority,
      complaint.submittedAt,
      comparedAt,
    );
    const updated = await this.complaints.updateSlaFlags(
      complaint.id,
      flags.responseSlaBreached,
      flags.resolutionSlaBreached,
    );
    if (!updated) {
      throw new NotFoundException({ code: 'COMPLAINT_NOT_FOUND', message: 'Complaint not found' });
    }
    return updated;
  }

  summaryForProperties(propertyIds: string[]): Promise<ComplaintSummaryRecord> {
    return this.complaints.summaryForProperties(propertyIds);
  }

  private async transition(
    complaintId: string,
    toStatus: StoredComplaintStatus,
    auditAction: string,
    context: AuditActorContext,
    options: {
      assignedToUserId?: string;
      cancelReason?: string;
      label?: string;
      notes?: string;
    } = {},
  ): Promise<ComplaintRecord> {
    const current = await this.get(complaintId);
    ComplaintStatusTransitionHelper.assertCanTransition(current.complaintStatus, toStatus);

    const updated = await this.complaints.transitionStatus(current.id, toStatus, {
      assignedToUserId: options.assignedToUserId,
      cancelReason: options.cancelReason,
    });
    if (!updated) {
      throw new BadRequestException({
        code: 'COMPLAINT_TRANSITION_FAILED',
        message: 'Complaint transition failed',
      });
    }

    await this.histories.record({
      complaintId: updated.id,
      fromStatus: current.complaintStatus,
      toStatus,
      actorUserId: context.actorUserId,
      label: options.label,
      notes: options.notes,
    });
    await this.writeComplaintAudit(auditAction, updated, context, current);
    return updated;
  }

  private async writeComplaintAudit(
    action: string,
    complaint: ComplaintRecord,
    context: AuditActorContext,
    before?: ComplaintRecord,
    extraData: Record<string, unknown> = {},
    client?: PoolClient,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: context.actorUserId,
        propertyId: complaint.propertyId,
        action,
        resourceType: 'complaint',
        resourceId: complaint.id,
        beforeData: before ? this.auditSnapshot(before) : undefined,
        afterData: { ...this.auditSnapshot(complaint), ...extraData },
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
    if (inserted.rows[0]) {
      return null;
    }
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

  private async completeCommand(
    client: PoolClient,
    actorUserId: string,
    route: string,
    idempotencyKey: string,
    body: { data: AdminMaintenanceDispatchResponse },
    workOrderId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = 'succeeded', response_status = 200, response_body = $4::jsonb,
           resource_type = 'maintenance_work_order', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorUserId, route, idempotencyKey, JSON.stringify(body), workOrderId],
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

  private dispatchResponse(
    complaint: ComplaintRecord,
    workOrder: WorkOrderRecord,
  ): AdminMaintenanceDispatchResponse {
    return {
      complaint: {
        id: complaint.id,
        propertyId: complaint.propertyId,
        roomId: complaint.roomId,
        complaintCode: complaint.complaintCode,
        priority: complaint.priority,
        status: complaint.complaintStatus,
        assignedToUserId: complaint.assignedToUserId,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
      },
      work_order: {
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
      },
    };
  }

  private async writeDispatchWorkOrderAudit(
    action: 'work_order.create' | 'work_order.assign',
    workOrder: WorkOrderRecord,
    context: AuditActorContext,
    before: WorkOrderRecord | undefined,
    client: PoolClient,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: context.actorUserId,
        propertyId: workOrder.propertyId,
        action,
        resourceType: 'maintenance_work_order',
        resourceId: workOrder.id,
        beforeData: before ? this.workOrderAuditSnapshot(before) : undefined,
        afterData: this.workOrderAuditSnapshot(workOrder),
        resultStatus: 'success',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      },
      client,
    );
  }

  private workOrderAuditSnapshot(workOrder: WorkOrderRecord): Record<string, unknown> {
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

  private async assertResidentCreateContext(input: CreateComplaintInput): Promise<void> {
    const active = await this.complaints.activeContextForUser(input.createdByUserId);
    if (!active) {
      throw new BadRequestException({
        code: 'ACTIVE_OCCUPANCY_NOT_FOUND',
        message: 'Active occupancy not found for resident',
      });
    }
    if (active.propertyId !== input.propertyId || active.residentId !== input.residentId) {
      throw new BadRequestException({
        code: 'COMPLAINT_RESIDENT_SCOPE_MISMATCH',
        message: 'Complaint resident context does not match authenticated resident',
      });
    }
    if (input.roomId && input.roomId !== active.roomId) {
      throw new BadRequestException({
        code: 'COMPLAINT_ROOM_SCOPE_MISMATCH',
        message:
          'Resident can only create complaints for their active room or a property-level location note',
      });
    }
  }

  private normalizeFileIds(fileIds: string[] | undefined): string[] {
    const unique = Array.from(new Set(fileIds ?? []));
    if (unique.length > 5) {
      throw new BadRequestException({
        code: 'COMPLAINT_ATTACHMENT_FILE_LIMIT_EXCEEDED',
        message: 'Complaint can attach at most 5 files',
      });
    }
    return unique;
  }

  private async validateComplaintAttachmentFiles(
    fileIds: string[],
    input: CreateComplaintInput,
  ): Promise<void> {
    for (const fileId of fileIds) {
      const file = await this.files.findById(fileId);
      if (!file || file.isDeleted) {
        throw new BadRequestException({
          code: 'COMPLAINT_ATTACHMENT_FILE_NOT_FOUND',
          message: 'Complaint attachment file was not found or has been deleted',
        });
      }
      if (file.filePurpose !== 'complaint_attachment') {
        throw new BadRequestException({
          code: 'COMPLAINT_ATTACHMENT_FILE_PURPOSE_INVALID',
          message: 'Attached file must use complaint_attachment purpose',
        });
      }
      if (file.propertyId !== input.propertyId) {
        throw new BadRequestException({
          code: 'COMPLAINT_ATTACHMENT_FILE_PROPERTY_MISMATCH',
          message: 'Attached file must belong to the same property as the complaint',
        });
      }
      if (file.uploaderUserId !== input.createdByUserId) {
        throw new BadRequestException({
          code: 'COMPLAINT_ATTACHMENT_FILE_OWNER_MISMATCH',
          message: 'Resident can only attach files they uploaded',
        });
      }
    }
  }

  private auditSnapshot(complaint: ComplaintRecord): Record<string, unknown> {
    return {
      id: complaint.id,
      complaintCode: complaint.complaintCode,
      complaintStatus: complaint.complaintStatus,
      priority: complaint.priority,
      roomId: complaint.roomId,
      categoryId: complaint.categoryId,
      assignedToUserId: complaint.assignedToUserId,
    };
  }
}
