import { BadRequestException } from '@nestjs/common';
import {
  SmartLockCredentialStatus,
  SmartLockDeviceStatus,
  SmartLockGrantStatus,
  SmartLockRestrictionStatus,
} from '../types/smart-lock.types';

export class SmartLockStatusTransitionHelper {
  private static readonly deviceTransitions: Record<SmartLockDeviceStatus, SmartLockDeviceStatus[]> = {
    provisioned: ['active', 'maintenance', 'decommissioned'],
    active: ['maintenance', 'decommissioned'],
    maintenance: ['active', 'decommissioned'],
    decommissioned: [],
  };

  private static readonly grantTransitions: Record<SmartLockGrantStatus, SmartLockGrantStatus[]> = {
    active: ['suspended', 'revoked', 'expired'],
    suspended: ['active', 'revoked', 'expired'],
    revoked: [],
    expired: [],
  };

  private static readonly credentialTransitions: Record<SmartLockCredentialStatus, SmartLockCredentialStatus[]> = {
    creating: ['active', 'disabled', 'deleted', 'orphaned'],
    active: ['disabled', 'expired', 'deleted', 'orphaned'],
    disabled: ['active', 'deleted', 'orphaned'],
    expired: ['deleted', 'orphaned'],
    deleted: [],
    orphaned: ['deleted'],
  };

  private static readonly restrictionTransitions: Record<SmartLockRestrictionStatus, SmartLockRestrictionStatus[]> = {
    pending_approval: ['approved', 'rejected', 'cancelled'],
    approved: ['applied', 'lifted', 'cancelled'],
    applied: ['lifted'],
    rejected: [],
    lifted: [],
    cancelled: [],
  };

  static assertDeviceTransition(from: SmartLockDeviceStatus, to: SmartLockDeviceStatus): void {
    this.assertTransition('SMART_LOCK_DEVICE_INVALID_TRANSITION', from, to, this.deviceTransitions[from]);
  }

  static assertGrantTransition(from: SmartLockGrantStatus, to: SmartLockGrantStatus): void {
    this.assertTransition('SMART_LOCK_GRANT_INVALID_TRANSITION', from, to, this.grantTransitions[from]);
  }

  static assertCredentialTransition(from: SmartLockCredentialStatus, to: SmartLockCredentialStatus): void {
    this.assertTransition('SMART_LOCK_CREDENTIAL_INVALID_TRANSITION', from, to, this.credentialTransitions[from]);
  }

  static assertRestrictionTransition(from: SmartLockRestrictionStatus, to: SmartLockRestrictionStatus): void {
    this.assertTransition('SMART_LOCK_RESTRICTION_INVALID_TRANSITION', from, to, this.restrictionTransitions[from]);
  }

  private static assertTransition(code: string, from: string, to: string, allowed: string[]): void {
    if (from === to) {
      return;
    }
    if (!allowed.includes(to)) {
      throw new BadRequestException({ code, message: `Cannot transition from ${from} to ${to}` });
    }
  }
}
