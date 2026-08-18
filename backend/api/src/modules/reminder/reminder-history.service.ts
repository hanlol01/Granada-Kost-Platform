import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { ReminderComposerService } from './reminder-composer.service';

export type ReminderAttemptChannel = 'whatsapp_manual' | 'manual';
export type ReminderAttemptStatus = 'previewed' | 'external_opened' | 'manual_sent' | 'failed';

type AttemptRow = {
  id: string;
  property_id: string;
  resident_id: string;
  actor_user_id: string;
  channel: ReminderAttemptChannel;
  outcome_status: ReminderAttemptStatus;
  invoice_ids: string[];
  invoice_count: number;
  total_outstanding_amount: string | number;
  template_version: number;
  title_snapshot: string;
  body_snapshot: string;
  recipient_name_snapshot: string;
  room_number_snapshot: string;
  outcome_note: string | null;
  created_at: Date | string;
  archived_at: Date | string | null;
};

@Injectable()
export class ReminderHistoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly composer: ReminderComposerService,
  ) {}

  async createAttempt(
    user: UserAccessContext,
    propertyId: string,
    residentId: string,
    input: {
      invoice_ids: string[];
      channel: ReminderAttemptChannel;
      outcome_status: ReminderAttemptStatus;
      outcome_note?: string;
    },
    idempotencyKey?: string,
  ) {
    await this.properties.get(user, propertyId);
    this.assertInput(input, idempotencyKey);
    const route = 'POST:/admin/reminders/attempts';
    const fingerprint = JSON.stringify({ residentId, ...input });

    return this.database.transaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${propertyId}:${user.id}:${route}:${idempotencyKey}`,
      ]);
      const existing = await client.query<{ request_fingerprint: string; response_body: unknown }>(
        `SELECT request_fingerprint,response_body FROM idempotency_commands
         WHERE property_id=$1 AND actor_user_id=$2 AND route=$3 AND idempotency_key=$4 FOR UPDATE`,
        [propertyId, user.id, route, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was reused with different data',
          });
        return existing.rows[0].response_body;
      }

      const preview = await this.composer.residentPreview(
        user,
        propertyId,
        residentId,
        input.invoice_ids,
      );
      const responsePreview = preview;
      const recipient = preview.recipient;
      const action =
        input.outcome_status === 'external_opened'
          ? {
              channel: 'whatsapp_manual' as const,
              url: this.whatsappUrl(recipient.phone, preview.rendered.body),
            }
          : null;
      const attempt = await client.query<AttemptRow>(
        `INSERT INTO reminder_attempts(
           property_id,resident_id,actor_user_id,channel,outcome_status,invoice_ids,invoice_count,
           total_outstanding_amount,template_version,title_snapshot,body_snapshot,
           recipient_name_snapshot,room_number_snapshot,outcome_note
         ) VALUES($1,$2,$3,$4,$5,$6::uuid[],$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id,property_id,resident_id,actor_user_id,channel,outcome_status,invoice_ids,invoice_count,
                   total_outstanding_amount,template_version,title_snapshot,body_snapshot,
                   recipient_name_snapshot,room_number_snapshot,outcome_note,created_at,archived_at`,
        [
          propertyId,
          residentId,
          user.id,
          input.channel,
          input.outcome_status,
          input.invoice_ids,
          preview.invoice_ids.length,
          preview.total_outstanding_amount,
          preview.template.version,
          preview.rendered.title,
          preview.rendered.body,
          recipient.display_name,
          recipient.room_number,
          input.outcome_note?.trim() || null,
        ],
      );
      const response = {
        attempt: this.toResponse(attempt.rows[0]),
        preview: responsePreview,
        action,
      };
      await client.query(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,response_status,response_body,resource_type,resource_id,completed_at)
         VALUES($1,$2,$3,$4,$5,'succeeded',201,$6::jsonb,'reminder_attempt',$7,now())`,
        [
          propertyId,
          user.id,
          route,
          idempotencyKey,
          fingerprint,
          JSON.stringify(response),
          attempt.rows[0].id,
        ],
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'reminder.attempt.created',
          resourceType: 'reminder_attempt',
          resourceId: attempt.rows[0].id,
          afterData: {
            channel: input.channel,
            outcomeStatus: input.outcome_status,
            invoiceCount: preview.invoice_ids.length,
          },
          resultStatus: 'success',
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
         VALUES($1,$2,'reminder.attempt.created','reminder_attempt',$3,$4::jsonb,$5)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          propertyId,
          `reminder.attempt.created:${attempt.rows[0].id}`,
          attempt.rows[0].id,
          JSON.stringify({ channel: input.channel, outcome_status: input.outcome_status }),
          user.id,
        ],
      );
      return response;
    });
  }

  async list(
    user: UserAccessContext,
    query: {
      property_id: string;
      channel?: ReminderAttemptChannel;
      outcome_status?: ReminderAttemptStatus;
      include_archived?: boolean;
      search?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    await this.properties.get(user, query.property_id);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const values: unknown[] = [query.property_id];
    const predicates = ['property_id=$1'];
    if (!query.include_archived) predicates.push('archived_at IS NULL');
    this.addEqual(predicates, values, 'channel', query.channel);
    this.addEqual(predicates, values, 'outcome_status', query.outcome_status);
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      predicates.push(
        `(recipient_name_snapshot ILIKE $${values.length} OR room_number_snapshot ILIKE $${values.length})`,
      );
    }
    if (query.from) {
      values.push(query.from);
      predicates.push(`created_at >= $${values.length}::timestamptz`);
    }
    if (query.to) {
      values.push(query.to);
      predicates.push(`created_at < ($${values.length}::date + interval '1 day')`);
    }
    const where = predicates.join(' AND ');
    const count = await this.database.client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM reminder_attempts WHERE ${where}`,
      values,
    );
    const pageValues = [...values, limit, offset];
    const rows = await this.database.client.query<AttemptRow>(
      `SELECT id,property_id,resident_id,actor_user_id,channel,outcome_status,invoice_ids,invoice_count,
              total_outstanding_amount,template_version,title_snapshot,body_snapshot,
              recipient_name_snapshot,room_number_snapshot,outcome_note,created_at,archived_at
       FROM reminder_attempts WHERE ${where}
       ORDER BY created_at DESC,id DESC LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return {
      data: rows.rows.map((row) => this.toResponse(row)),
      meta: { limit, offset, total: Number(count.rows[0]?.total ?? 0) },
    };
  }

  async archive(
    user: UserAccessContext,
    propertyId: string,
    attemptId: string,
    idempotencyKey?: string,
  ) {
    await this.properties.get(user, propertyId);
    if (!idempotencyKey?.trim())
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required',
      });
    const route = 'POST:/admin/reminders/history/archive';
    const fingerprint = JSON.stringify({ propertyId, attemptId });
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ request_fingerprint: string; response_body: unknown }>(
        `SELECT request_fingerprint,response_body FROM idempotency_commands
         WHERE property_id=$1 AND actor_user_id=$2 AND route=$3 AND idempotency_key=$4 FOR UPDATE`,
        [propertyId, user.id, route, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was reused with different data',
          });
        return existing.rows[0].response_body;
      }
      const result = await client.query<AttemptRow>(
        `UPDATE reminder_attempts SET archived_at=COALESCE(archived_at,now())
         WHERE id=$1 AND property_id=$2
         RETURNING id,property_id,resident_id,actor_user_id,channel,outcome_status,invoice_ids,invoice_count,
                   total_outstanding_amount,template_version,title_snapshot,body_snapshot,
                   recipient_name_snapshot,room_number_snapshot,outcome_note,created_at,archived_at`,
        [attemptId, propertyId],
      );
      if (!result.rows[0])
        throw new NotFoundException({
          code: 'REMINDER_ATTEMPT_NOT_FOUND',
          message: 'Riwayat pengingat tidak ditemukan',
        });
      const response = { attempt: this.toResponse(result.rows[0]) };
      await client.query(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status,response_status,response_body,resource_type,resource_id,completed_at)
         VALUES($1,$2,$3,$4,$5,'succeeded',200,$6::jsonb,'reminder_attempt',$7,now())`,
        [
          propertyId,
          user.id,
          route,
          idempotencyKey,
          fingerprint,
          JSON.stringify(response),
          attemptId,
        ],
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'reminder.attempt.archived',
          resourceType: 'reminder_attempt',
          resourceId: attemptId,
          resultStatus: 'success',
        },
        client,
      );
      return response;
    });
  }

  private assertInput(
    input: {
      invoice_ids: string[];
      channel: ReminderAttemptChannel;
      outcome_status: ReminderAttemptStatus;
    },
    key?: string,
  ) {
    if (!key?.trim())
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required',
      });
    if (!input.invoice_ids.length)
      throw new BadRequestException({
        code: 'REMINDER_INVOICE_SELECTION_INVALID',
        message: 'Pilih minimal satu tagihan',
      });
    if (input.outcome_status === 'external_opened' && input.channel !== 'whatsapp_manual')
      throw new BadRequestException({
        code: 'REMINDER_ATTEMPT_CHANNEL_INVALID',
        message: 'Aksi buka WhatsApp harus memakai kanal WhatsApp manual',
      });
    if (input.outcome_status === 'manual_sent' && input.channel !== 'manual')
      throw new BadRequestException({
        code: 'REMINDER_ATTEMPT_CHANNEL_INVALID',
        message: 'Konfirmasi kirim manual harus memakai kanal manual',
      });
  }

  private whatsappUrl(phone: string | null, body: string) {
    const normalized = phone?.replace(/\D/g, '');
    if (!normalized)
      throw new BadRequestException({
        code: 'REMINDER_RECIPIENT_PHONE_MISSING',
        message: 'Nomor WhatsApp penghuni belum tersedia',
      });
    return `https://wa.me/${normalized.replace(/^0/, '62')}?text=${encodeURIComponent(body)}`;
  }

  private toResponse(row: AttemptRow) {
    return {
      id: row.id,
      property_id: row.property_id,
      resident_id: row.resident_id,
      actor_user_id: row.actor_user_id,
      channel: row.channel,
      outcome_status: row.outcome_status,
      invoice_ids: row.invoice_ids,
      invoice_count: row.invoice_count,
      total_outstanding_amount: Number(row.total_outstanding_amount),
      template_version: row.template_version,
      recipient_name: row.recipient_name_snapshot,
      room_number: row.room_number_snapshot,
      outcome_note: row.outcome_note,
      created_at: this.iso(row.created_at),
      archived_at: row.archived_at ? this.iso(row.archived_at) : null,
    };
  }

  private iso(value: Date | string) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private addEqual(predicates: string[], values: unknown[], column: string, value?: string) {
    if (!value) return;
    values.push(value);
    predicates.push(`${column}=$${values.length}`);
  }
}
