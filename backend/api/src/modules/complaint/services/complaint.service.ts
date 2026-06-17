import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
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

@Injectable()
export class ComplaintService {
  constructor(
    private readonly complaints: ComplaintRepository,
    private readonly histories: ComplaintHistoryRepository,
    private readonly files: ComplaintFileRepository,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, status?: StoredComplaintStatus, limit?: number, offset?: number): Promise<ComplaintRecord[]> {
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
      throw new BadRequestException({ code: 'ACTIVE_OCCUPANCY_NOT_FOUND', message: 'Active occupancy not found for resident' });
    }
    return context;
  }

  async createComplaint(input: CreateComplaintInput, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    const complaint = await this.complaints.create(input);
    await this.histories.record({
      complaintId: complaint.id,
      fromStatus: 'submitted',
      toStatus: 'submitted',
      actorUserId: context.actorUserId,
      label: 'Complaint submitted',
    });
    await this.writeComplaintAudit(COMPLAINT_AUDIT_ACTIONS.create, complaint, context);
    return complaint;
  }

  async generateCode(propertyName: string, propertyId: string, date = new Date()): Promise<string> {
    const propertyCode = ComplaintCodeGenerator.propertyCode(propertyName);
    const sequence = await this.complaints.nextSequence(propertyId, date.getFullYear());
    return ComplaintCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  acknowledge(complaintId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'acknowledged', COMPLAINT_AUDIT_ACTIONS.acknowledge, context, {
      label: 'Complaint acknowledged',
    });
  }

  assign(complaintId: string, assignedToUserId: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'in_progress', COMPLAINT_AUDIT_ACTIONS.assign, context, {
      assignedToUserId,
      label: 'Complaint assigned',
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

  cancel(complaintId: string, reason: string, context: AuditActorContext = {}): Promise<ComplaintRecord> {
    return this.transition(complaintId, 'cancelled', COMPLAINT_AUDIT_ACTIONS.cancel, context, {
      cancelReason: reason,
      label: 'Complaint cancelled',
      notes: reason,
    });
  }

  async attachFile(input: CreateComplaintFileInput): Promise<ComplaintFileRecord> {
    return this.files.attach(input);
  }

  listFiles(complaintId: string): Promise<ComplaintFileRecord[]> {
    return this.files.list(complaintId);
  }

  async refreshSlaFlags(complaintId: string, comparedAt = new Date()): Promise<ComplaintRecord> {
    const complaint = await this.get(complaintId);
    const flags = SlaCalculationHelper.breachStatus(complaint.priority, complaint.submittedAt, comparedAt);
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
      throw new BadRequestException({ code: 'COMPLAINT_TRANSITION_FAILED', message: 'Complaint transition failed' });
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
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId: complaint.propertyId,
      action,
      resourceType: 'complaint',
      resourceId: complaint.id,
      beforeData: before ? this.auditSnapshot(before) : undefined,
      afterData: this.auditSnapshot(complaint),
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
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
