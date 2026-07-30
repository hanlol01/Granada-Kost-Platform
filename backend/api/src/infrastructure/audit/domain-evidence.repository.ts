import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditRepository } from './audit.repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const REASON = /^[A-Z][A-Z0-9_]{2,63}$/;

export type DomainEvidenceInput = {
  propertyId: string;
  actorUserId: string;
  aggregateType: string;
  aggregateId: string;
  action: string;
  eventType: string;
  eventKey: string;
  correlationId: string;
  occurredAt: string;
  resultStatus: 'success' | 'failed' | 'denied';
  affectedCount: number;
  reasonCode: string;
};

const INPUT_KEYS = [
  'action',
  'actorUserId',
  'affectedCount',
  'aggregateId',
  'aggregateType',
  'correlationId',
  'eventKey',
  'eventType',
  'occurredAt',
  'propertyId',
  'reasonCode',
  'resultStatus',
] as const;

function assertSafeInput(input: DomainEvidenceInput): void {
  const keys = Object.keys(input).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    throw new BadRequestException('Invalid domain evidence envelope');
  }
  if (
    !UUID_V4.test(input.propertyId) ||
    !UUID_V4.test(input.actorUserId) ||
    !UUID_V4.test(input.aggregateId) ||
    !UUID_V4.test(input.correlationId) ||
    !CODE.test(input.aggregateType) ||
    !CODE.test(input.action) ||
    !CODE.test(input.eventType) ||
    !CODE.test(input.eventKey) ||
    !REASON.test(input.reasonCode) ||
    !Number.isSafeInteger(input.affectedCount) ||
    input.affectedCount < 0 ||
    !['success', 'failed', 'denied'].includes(input.resultStatus) ||
    Number.isNaN(Date.parse(input.occurredAt)) ||
    new Date(input.occurredAt).toISOString() !== input.occurredAt
  ) {
    throw new BadRequestException('Invalid domain evidence envelope');
  }
}

@Injectable()
export class DomainEvidenceRepository {
  constructor(private readonly audit: AuditRepository) {}

  async write(input: DomainEvidenceInput, client: PoolClient): Promise<void> {
    assertSafeInput(input);
    const safeEvidence = {
      schema_version: 1,
      affected_count: input.affectedCount,
      reason_code: input.reasonCode,
      occurred_at: input.occurredAt,
    };

    await this.audit.write(
      {
        actorUserId: input.actorUserId,
        propertyId: input.propertyId,
        action: input.action,
        resourceType: input.aggregateType,
        resourceId: input.aggregateId,
        afterData: safeEvidence,
        resultStatus: input.resultStatus,
        correlationId: input.correlationId,
      },
      client,
    );
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload_version, payload, correlation_id, actor_user_id, event_status
       )
       VALUES ($1, $2, $3, $4, $5, 1, $6::jsonb, $7, $8, 'pending')`,
      [
        input.propertyId,
        input.eventKey,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(safeEvidence),
        input.correlationId,
        input.actorUserId,
      ],
    );
  }
}
