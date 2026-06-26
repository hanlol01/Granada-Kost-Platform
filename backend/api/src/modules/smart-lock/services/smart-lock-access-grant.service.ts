import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockStatusTransitionHelper } from '../helpers/smart-lock-status-transition.helper';
import { SmartLockAccessGrantRepository } from '../repositories/smart-lock-access-grant.repository';
import {
  CreateSmartLockAccessGrantInput,
  SmartLockAccessGrantRecord,
  SmartLockAuditContext,
  SmartLockGrantStatus,
} from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

@Injectable()
export class SmartLockAccessGrantService {
  constructor(
    private readonly grants: SmartLockAccessGrantRepository,
    private readonly audit: SmartLockAuditService,
  ) {}

  listForDevice(deviceId: string): Promise<SmartLockAccessGrantRecord[]> {
    return this.grants.listForDevice(deviceId);
  }

  async activeGrantForUser(userId: string): Promise<SmartLockAccessGrantRecord> {
    const grant = await this.grants.findFirstActiveForUser(userId);
    if (!grant) {
      throw new NotFoundException({ code: 'SMART_LOCK_ACTIVE_GRANT_NOT_FOUND', message: 'Active smart lock access grant not found' });
    }
    return grant;
  }

  async get(grantId: string): Promise<SmartLockAccessGrantRecord> {
    const grant = await this.grants.findById(grantId);
    if (!grant) {
      throw new NotFoundException({ code: 'SMART_LOCK_ACCESS_GRANT_NOT_FOUND', message: 'Smart lock access grant not found' });
    }
    return grant;
  }

  async assertActiveGrantForUser(deviceId: string, userId: string): Promise<SmartLockAccessGrantRecord> {
    const grant = await this.grants.findActiveForUser(deviceId, userId);
    if (!grant) {
      throw new BadRequestException({ code: 'SMART_LOCK_ACTIVE_GRANT_REQUIRED', message: 'Active smart lock access grant is required' });
    }
    return grant;
  }

  async createGrant(input: CreateSmartLockAccessGrantInput, context: SmartLockAuditContext = {}): Promise<SmartLockAccessGrantRecord> {
    const grant = await this.grants.create(input);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.accessGrantCreate,
      resourceType: 'smart_lock_access_grant',
      resourceId: grant.id,
      propertyId: grant.propertyId,
      afterData: this.auditSnapshot(grant),
      context,
    });
    return grant;
  }

  async revokeGrant(grantId: string, reason: string, context: SmartLockAuditContext = {}): Promise<SmartLockAccessGrantRecord> {
    return this.transition(grantId, 'revoked', reason, SMART_LOCK_AUDIT_ACTIONS.accessGrantRevoke, context);
  }

  async transition(
    grantId: string,
    toStatus: SmartLockGrantStatus,
    reason?: string,
    auditAction: string = SMART_LOCK_AUDIT_ACTIONS.accessGrantCreate,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockAccessGrantRecord> {
    const current = await this.get(grantId);
    SmartLockStatusTransitionHelper.assertGrantTransition(current.grantStatus, toStatus);
    const updated = await this.grants.transition(grantId, toStatus, reason);
    if (!updated) {
      throw new BadRequestException({ code: 'SMART_LOCK_ACCESS_GRANT_TRANSITION_FAILED', message: 'Access grant transition failed' });
    }
    await this.audit.writeDomainAudit({
      action: auditAction,
      resourceType: 'smart_lock_access_grant',
      resourceId: updated.id,
      propertyId: updated.propertyId,
      beforeData: this.auditSnapshot(current),
      afterData: this.auditSnapshot(updated),
      context,
    });
    return updated;
  }

  private auditSnapshot(grant: SmartLockAccessGrantRecord): Record<string, unknown> {
    return {
      id: grant.id,
      smartLockDeviceId: grant.smartLockDeviceId,
      residentId: grant.residentId,
      userId: grant.userId,
      grantType: grant.grantType,
      grantStatus: grant.grantStatus,
    };
  }
}
