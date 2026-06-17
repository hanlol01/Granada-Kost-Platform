import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { AuthAuditInput } from '../types/iam.types';

@Injectable()
export class AuthAuditRepository {
  constructor(private readonly database: DatabaseService) {}

  async write(input: AuthAuditInput): Promise<void> {
    await this.database.client.query(
      `INSERT INTO auth_audit_logs (
         actor_user_id, action, result_status, ip_address, user_agent, correlation_id, metadata
       )
       VALUES ($1, $2, $3, $4::inet, $5, $6, $7::jsonb)`,
      [
        input.actorUserId ?? null,
        input.action,
        input.resultStatus,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.correlationId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }
}
