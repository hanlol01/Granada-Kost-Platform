import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type WriteAuditInput = {
  actorUserId?: string;
  propertyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  resultStatus: 'success' | 'failed' | 'denied';
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

@Injectable()
export class AuditRepository {
  constructor(private readonly database: DatabaseService) {}

  async write(input: WriteAuditInput): Promise<void> {
    await this.database.client.query(
      `INSERT INTO audit_logs (
         actor_user_id, property_id, action, resource_type, resource_id,
         before_data, after_data, result_status, ip_address, user_agent, correlation_id
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::inet, $10, $11)`,
      [
        input.actorUserId ?? null,
        input.propertyId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.beforeData === undefined ? null : JSON.stringify(input.beforeData),
        input.afterData === undefined ? null : JSON.stringify(input.afterData),
        input.resultStatus,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.correlationId ?? null,
      ],
    );
  }
}
