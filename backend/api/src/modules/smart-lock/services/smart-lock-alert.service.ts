import { Injectable, NotFoundException } from '@nestjs/common';
import { SMART_LOCK_AUDIT_ACTIONS } from '../constants/smart-lock.constants';
import { SmartLockAlertRepository } from '../repositories/smart-lock-alert.repository';
import { CreateSmartLockAlertInput, SmartLockAlertRecord, SmartLockAlertStatus, SmartLockAuditContext } from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

@Injectable()
export class SmartLockAlertService {
  constructor(
    private readonly alerts: SmartLockAlertRepository,
    private readonly audit: SmartLockAuditService,
  ) {}

  listActive(propertyId: string): Promise<SmartLockAlertRecord[]> {
    return this.alerts.listActive(propertyId);
  }

  listForProperties(propertyIds: string[], status?: SmartLockAlertStatus, limit?: number, offset?: number): Promise<SmartLockAlertRecord[]> {
    return this.alerts.listForProperties(propertyIds, status, limit, offset);
  }

  async get(alertId: string): Promise<SmartLockAlertRecord> {
    const alert = await this.alerts.findById(alertId);
    if (!alert) {
      throw new NotFoundException({ code: 'SMART_LOCK_ALERT_NOT_FOUND', message: 'Smart lock alert not found' });
    }
    return alert;
  }

  createAlert(input: CreateSmartLockAlertInput): Promise<SmartLockAlertRecord> {
    return this.alerts.create(input);
  }

  async acknowledge(alertId: string, actorUserId: string, context: SmartLockAuditContext = {}): Promise<SmartLockAlertRecord | null> {
    const before = await this.get(alertId);
    const alert = await this.alerts.acknowledge(alertId, actorUserId);
    if (alert) {
      await this.audit.writeDomainAudit({
        action: SMART_LOCK_AUDIT_ACTIONS.alertAcknowledge,
        resourceType: 'smart_lock_alert',
        resourceId: alert.id,
        propertyId: alert.propertyId,
        beforeData: this.auditSnapshot(before),
        afterData: this.auditSnapshot(alert),
        context,
      });
    }
    return alert;
  }

  async resolve(alertId: string, actorUserId?: string, context: SmartLockAuditContext = {}): Promise<SmartLockAlertRecord | null> {
    const before = await this.get(alertId);
    const alert = await this.alerts.resolve(alertId, actorUserId);
    if (alert) {
      await this.audit.writeDomainAudit({
        action: SMART_LOCK_AUDIT_ACTIONS.alertResolve,
        resourceType: 'smart_lock_alert',
        resourceId: alert.id,
        propertyId: alert.propertyId,
        beforeData: this.auditSnapshot(before),
        afterData: this.auditSnapshot(alert),
        context,
      });
    }
    return alert;
  }

  private auditSnapshot(alert: SmartLockAlertRecord): Record<string, unknown> {
    return {
      id: alert.id,
      smartLockDeviceId: alert.smartLockDeviceId,
      alertType: alert.alertType,
      severity: alert.severity,
      alertStatus: alert.alertStatus,
    };
  }
}
