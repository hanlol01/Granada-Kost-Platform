import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockRestrictionHelper } from '../helpers/smart-lock-restriction.helper';
import { SmartLockStatusTransitionHelper } from '../helpers/smart-lock-status-transition.helper';
import { SmartLockRestrictionRepository } from '../repositories/smart-lock-restriction.repository';
import {
  CreateSmartLockRestrictionInput,
  SmartLockAuditContext,
  SmartLockRestrictionRecord,
  SmartLockRestrictionStatus,
} from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

@Injectable()
export class SmartLockRestrictionService {
  constructor(
    private readonly restrictions: SmartLockRestrictionRepository,
    private readonly audit: SmartLockAuditService,
  ) {}

  listActiveForResident(residentId: string): Promise<SmartLockRestrictionRecord[]> {
    return this.restrictions.listActiveForResident(residentId);
  }

  listForProperties(
    propertyIds: string[],
    status?: SmartLockRestrictionStatus,
    limit?: number,
    offset?: number,
  ): Promise<SmartLockRestrictionRecord[]> {
    return this.restrictions.listForProperties(propertyIds, status, limit, offset);
  }

  async get(restrictionId: string): Promise<SmartLockRestrictionRecord> {
    const restriction = await this.restrictions.findById(restrictionId);
    if (!restriction) {
      throw new NotFoundException({ code: 'SMART_LOCK_RESTRICTION_NOT_FOUND', message: 'Smart lock restriction not found' });
    }
    return restriction;
  }

  async requestRestriction(input: CreateSmartLockRestrictionInput, context: SmartLockAuditContext = {}): Promise<SmartLockRestrictionRecord> {
    const restriction = await this.restrictions.create(input);
    await this.auditRestriction(SMART_LOCK_AUDIT_ACTIONS.restrictionRequest, restriction, context);
    return restriction;
  }

  async approveRestriction(
    restriction: SmartLockRestrictionRecord,
    approvedByUserId: string,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockRestrictionRecord> {
    SmartLockStatusTransitionHelper.assertRestrictionTransition(restriction.restrictionStatus, 'approved');
    const updated = await this.restrictions.approve(restriction.id, approvedByUserId, SmartLockRestrictionHelper.gracePeriodEndsAt());
    if (!updated) {
      throw new BadRequestException({ code: 'SMART_LOCK_RESTRICTION_APPROVE_FAILED', message: 'Restriction approve failed' });
    }
    await this.auditRestriction(SMART_LOCK_AUDIT_ACTIONS.restrictionApprove, updated, context, restriction);
    return updated;
  }

  async applyRestriction(restriction: SmartLockRestrictionRecord, context: SmartLockAuditContext = {}): Promise<SmartLockRestrictionRecord> {
    return this.transition(restriction, 'applied', SMART_LOCK_AUDIT_ACTIONS.restrictionApply, context);
  }

  async rejectRestriction(
    restriction: SmartLockRestrictionRecord,
    actorUserId: string,
    reason: string,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockRestrictionRecord> {
    return this.transition(restriction, 'rejected', SMART_LOCK_AUDIT_ACTIONS.restrictionReject, context, actorUserId, reason);
  }

  async liftRestriction(
    restriction: SmartLockRestrictionRecord,
    actorUserId: string,
    reason: string,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockRestrictionRecord> {
    return this.transition(restriction, 'lifted', SMART_LOCK_AUDIT_ACTIONS.restrictionLift, context, actorUserId, reason);
  }

  async cancelRestriction(
    restriction: SmartLockRestrictionRecord,
    reason: string,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockRestrictionRecord> {
    return this.transition(restriction, 'cancelled', SMART_LOCK_AUDIT_ACTIONS.restrictionCancel, context, undefined, reason);
  }

  async suggestLiftIfReferenceCleared(
    restriction: SmartLockRestrictionRecord,
    clearedReference: { refType?: string; refId?: string },
  ): Promise<SmartLockRestrictionRecord | null> {
    if (!SmartLockRestrictionHelper.shouldSuggestLift(restriction, clearedReference)) {
      return null;
    }
    return this.restrictions.markLiftSuggested(restriction.id);
  }

  private async transition(
    current: SmartLockRestrictionRecord,
    toStatus: SmartLockRestrictionStatus,
    auditAction: string,
    context: SmartLockAuditContext,
    actorUserId?: string,
    reason?: string,
  ): Promise<SmartLockRestrictionRecord> {
    SmartLockStatusTransitionHelper.assertRestrictionTransition(current.restrictionStatus, toStatus);
    const updated = await this.restrictions.transition(current.id, toStatus, actorUserId, reason);
    if (!updated) {
      throw new BadRequestException({ code: 'SMART_LOCK_RESTRICTION_TRANSITION_FAILED', message: 'Restriction transition failed' });
    }
    await this.auditRestriction(auditAction, updated, context, current);
    return updated;
  }

  private async auditRestriction(
    action: string,
    restriction: SmartLockRestrictionRecord,
    context: SmartLockAuditContext,
    before?: SmartLockRestrictionRecord,
  ): Promise<void> {
    await this.audit.writeDomainAudit({
      action,
      resourceType: 'smart_lock_restriction',
      resourceId: restriction.id,
      propertyId: restriction.propertyId,
      beforeData: before ? this.auditSnapshot(before) : undefined,
      afterData: this.auditSnapshot(restriction),
      context,
    });
  }

  private auditSnapshot(restriction: SmartLockRestrictionRecord): Record<string, unknown> {
    return {
      id: restriction.id,
      smartLockDeviceId: restriction.smartLockDeviceId,
      residentId: restriction.residentId,
      reasonType: restriction.reasonType,
      restrictionStatus: restriction.restrictionStatus,
      gracePeriodEndsAt: restriction.gracePeriodEndsAt,
      liftSuggestedAt: restriction.liftSuggestedAt,
    };
  }
}
