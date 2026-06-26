import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockCredentialHelper } from '../helpers/smart-lock-credential.helper';
import { SmartLockStatusTransitionHelper } from '../helpers/smart-lock-status-transition.helper';
import { SmartLockCredentialRepository } from '../repositories/smart-lock-credential.repository';
import {
  CreateSmartLockCredentialInput,
  SmartLockAuditContext,
  SmartLockCredentialRecord,
  SmartLockCredentialStatus,
} from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

@Injectable()
export class SmartLockCredentialService {
  constructor(
    private readonly credentials: SmartLockCredentialRepository,
    private readonly audit: SmartLockAuditService,
  ) {}

  listForDevice(deviceId: string, status?: SmartLockCredentialStatus): Promise<SmartLockCredentialRecord[]> {
    return this.credentials.listForDevice(deviceId, status);
  }

  listForUser(userId: string): Promise<SmartLockCredentialRecord[]> {
    return this.credentials.listForUser(userId);
  }

  async get(credentialId: string): Promise<SmartLockCredentialRecord> {
    const credential = await this.credentials.findById(credentialId);
    if (!credential) {
      throw new NotFoundException({ code: 'SMART_LOCK_CREDENTIAL_NOT_FOUND', message: 'Smart lock credential not found' });
    }
    return credential;
  }

  activePinCount(deviceId: string): Promise<number> {
    return this.credentials.activePinCount(deviceId);
  }

  async createCredential(input: CreateSmartLockCredentialInput, context: SmartLockAuditContext = {}): Promise<SmartLockCredentialRecord> {
    SmartLockCredentialHelper.assertNoPlainSecrets(input);
    SmartLockCredentialHelper.assertCredentialShape(input.credentialType, input);
    const credential = await this.credentials.create(input);
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.credentialCreate,
      resourceType: 'smart_lock_credential',
      resourceId: credential.id,
      afterData: this.auditSnapshot(credential),
      context,
    });
    return credential;
  }

  async disableCredential(
    credential: SmartLockCredentialRecord,
    disabledByUserId: string,
    disableReason: string,
    context: SmartLockAuditContext = {},
  ): Promise<SmartLockCredentialRecord> {
    return this.transition(credential, 'disabled', SMART_LOCK_AUDIT_ACTIONS.credentialDisable, context, {
      disabledByUserId,
      disableReason,
    });
  }

  async reEnableCredential(credential: SmartLockCredentialRecord, context: SmartLockAuditContext = {}): Promise<SmartLockCredentialRecord> {
    return this.transition(credential, 'active', SMART_LOCK_AUDIT_ACTIONS.credentialReEnable, context);
  }

  async deleteCredential(credential: SmartLockCredentialRecord, context: SmartLockAuditContext = {}): Promise<SmartLockCredentialRecord> {
    return this.transition(credential, 'deleted', SMART_LOCK_AUDIT_ACTIONS.credentialDelete, context);
  }

  async transition(
    current: SmartLockCredentialRecord,
    toStatus: SmartLockCredentialStatus,
    auditAction: string,
    context: SmartLockAuditContext = {},
    options: { disabledByUserId?: string; disableReason?: string; tuyaCredentialId?: string } = {},
  ): Promise<SmartLockCredentialRecord> {
    SmartLockStatusTransitionHelper.assertCredentialTransition(current.credentialStatus, toStatus);
    const updated = await this.credentials.transition(current.id, toStatus, options);
    if (!updated) {
      throw new BadRequestException({ code: 'SMART_LOCK_CREDENTIAL_TRANSITION_FAILED', message: 'Credential transition failed' });
    }
    await this.audit.writeDomainAudit({
      action: auditAction,
      resourceType: 'smart_lock_credential',
      resourceId: updated.id,
      beforeData: this.auditSnapshot(current),
      afterData: this.auditSnapshot(updated),
      context,
    });
    return updated;
  }

  private auditSnapshot(credential: SmartLockCredentialRecord): Record<string, unknown> {
    return {
      id: credential.id,
      smartLockDeviceId: credential.smartLockDeviceId,
      accessGrantId: credential.accessGrantId,
      credentialType: credential.credentialType,
      credentialStatus: credential.credentialStatus,
      hasPinDisplayHash: Boolean(credential.pinDisplayHash),
    };
  }
}
