import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { ReminderComposerService } from './reminder-composer.service';
import {
  formatReminderAmount,
  formatReminderDate,
  formatReminderRoom,
  propertyReminderName,
  recipientDisplayName,
  recipientSalutation,
  type ReminderRecipientKind,
} from './reminder-message-formatters';

export type ReminderAttemptChannel = 'whatsapp_manual' | 'manual';
export type ReminderAttemptStatus = 'previewed' | 'external_opened' | 'manual_sent' | 'failed';
export type LeaseReminderMilestone = 'h60' | 'h30' | 'h14';

type AttemptRow = {
  id: string;
  property_id: string;
  resident_id: string;
  actor_user_id: string;
  reminder_kind?: 'invoice' | 'lease_ending';
  lease_id?: string | null;
  reminder_milestone?: LeaseReminderMilestone | null;
  recipient_kind?: ReminderRecipientKind;
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

type LeaseReminderContext = {
  lease_id: string;
  property_id: string;
  resident_id: string;
  resident_name: string;
  resident_phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  room_number: string;
  room_category: string | null;
  room_unit_code: string | null;
  building_name: string | null;
  property_name: string;
  lease_start_date: string;
  lease_end_date: string;
  days_remaining: number;
  outstanding_amount: string | number;
  now_hour: number;
  renewal_state: string | null;
  checkout_state: string | null;
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
      recipient_kind?: ReminderRecipientKind;
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
        input.recipient_kind,
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
           property_id,resident_id,actor_user_id,recipient_kind,channel,outcome_status,invoice_ids,invoice_count,
           total_outstanding_amount,template_version,title_snapshot,body_snapshot,
           recipient_name_snapshot,room_number_snapshot,outcome_note
         ) VALUES($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id,property_id,resident_id,actor_user_id,recipient_kind,channel,outcome_status,invoice_ids,invoice_count,
                   total_outstanding_amount,template_version,title_snapshot,body_snapshot,
                   recipient_name_snapshot,room_number_snapshot,outcome_note,created_at,archived_at`,
        [
          propertyId,
          residentId,
          user.id,
          preview.recipient.kind,
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
            recipientKind: preview.recipient.kind,
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
          JSON.stringify({
            channel: input.channel,
            outcome_status: input.outcome_status,
            recipient_kind: preview.recipient.kind,
          }),
          user.id,
        ],
      );
      return response;
    });
  }

  async createLeaseAttempt(
    user: UserAccessContext,
    propertyId: string,
    leaseId: string,
    input: {
      milestone: LeaseReminderMilestone;
      channel: ReminderAttemptChannel;
      outcome_status: ReminderAttemptStatus;
      recipient_kind?: ReminderRecipientKind;
      outcome_note?: string;
    },
    idempotencyKey?: string,
  ) {
    await this.properties.get(user, propertyId);
    this.assertLeaseInput(input, idempotencyKey);
    const route = 'POST:/admin/reminders/lease-attempts';
    const fingerprint = JSON.stringify({ leaseId, ...input });

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

      const context = await this.loadLeaseReminderContext(client, propertyId, leaseId);
      if (!context)
        throw new NotFoundException({
          code: 'REMINDER_LEASE_NOT_FOUND',
          message: 'Penyewaan aktif tidak ditemukan dalam properti ini',
        });
      this.assertLeaseEligibility(context, input.milestone);
      const preview = this.leaseReminderPreview(context, input.milestone, input.recipient_kind);
      const action =
        input.outcome_status === 'external_opened'
          ? {
              channel: 'whatsapp_manual' as const,
              url: this.whatsappUrl(preview.recipient.phone, preview.rendered.body),
            }
          : null;
      const attempt = await client.query<AttemptRow>(
        `INSERT INTO reminder_attempts(
           property_id,resident_id,actor_user_id,reminder_kind,lease_id,reminder_milestone,recipient_kind,
           channel,outcome_status,invoice_ids,invoice_count,total_outstanding_amount,
           template_version,title_snapshot,body_snapshot,recipient_name_snapshot,room_number_snapshot,
           outcome_note
         ) VALUES($1,$2,$3,'lease_ending',$4,$5,$6,$7,$8,ARRAY[]::uuid[],0,$9,1,$10,$11,$12,$13,$14)
         RETURNING id,property_id,resident_id,actor_user_id,reminder_kind,lease_id,reminder_milestone,recipient_kind,
                   channel,outcome_status,invoice_ids,invoice_count,total_outstanding_amount,
                   template_version,title_snapshot,body_snapshot,recipient_name_snapshot,room_number_snapshot,
                   outcome_note,created_at,archived_at`,
        [
          propertyId,
          context.resident_id,
          user.id,
          leaseId,
          input.milestone,
          preview.recipient.kind,
          input.channel,
          input.outcome_status,
          preview.total_outstanding_amount,
          preview.rendered.title,
          preview.rendered.body,
          preview.recipient.display_name,
          preview.recipient.room_number,
          input.outcome_note?.trim() || null,
        ],
      );
      const response = {
        attempt: this.toResponse(attempt.rows[0]),
        preview,
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
          action: 'reminder.lease_attempt.created',
          resourceType: 'reminder_attempt',
          resourceId: attempt.rows[0].id,
          afterData: {
            leaseId,
            milestone: input.milestone,
            outcomeStatus: input.outcome_status,
            recipientKind: preview.recipient.kind,
          },
          resultStatus: 'success',
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
         VALUES($1,$2,'reminder.lease_attempt.created','reminder_attempt',$3,$4::jsonb,$5)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          propertyId,
          `reminder.lease_attempt.created:${attempt.rows[0].id}`,
          attempt.rows[0].id,
          JSON.stringify({
            lease_id: leaseId,
            milestone: input.milestone,
            outcome_status: input.outcome_status,
            recipient_kind: preview.recipient.kind,
          }),
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
      resident_id?: string;
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
    this.addEqual(predicates, values, 'resident_id', query.resident_id);
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
      `SELECT id,property_id,resident_id,actor_user_id,reminder_kind,lease_id,reminder_milestone,recipient_kind,
              channel,outcome_status,invoice_ids,invoice_count,
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
         RETURNING id,property_id,resident_id,actor_user_id,reminder_kind,lease_id,reminder_milestone,recipient_kind,
                   channel,outcome_status,invoice_ids,invoice_count,
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

  private async loadLeaseReminderContext(
    client: PoolClient,
    propertyId: string,
    leaseId: string,
  ): Promise<LeaseReminderContext | null> {
    const result = await client.query<LeaseReminderContext>(
      `WITH clock AS (SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS today)
       SELECT l.id AS lease_id,l.property_id,l.resident_id,
              resident.full_name AS resident_name,resident.phone AS resident_phone,
              resident.parent_name,resident.parent_phone,
              room.number AS room_number,room.category AS room_category,room.unit_code AS room_unit_code,
              building.building_name,p.name AS property_name,
              l.start_date::text AS lease_start_date,l.end_date::text AS lease_end_date,
              GREATEST(l.end_date-clock.today,0)::int AS days_remaining,
              COALESCE(arrears.outstanding_amount,0) AS outstanding_amount,
              EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int AS now_hour,
              renewal.state AS renewal_state,checkout.state AS checkout_state
       FROM leases l
       JOIN residents resident ON resident.id=l.resident_id AND resident.property_id=l.property_id
       JOIN rooms room ON room.id=l.room_id AND room.property_id=l.property_id
       LEFT JOIN room_buildings building ON building.id=room.building_id AND building.property_id=room.property_id
       JOIN properties p ON p.id=l.property_id
       CROSS JOIN clock
       LEFT JOIN LATERAL (
         SELECT state FROM lease_renewal_commands
         WHERE predecessor_lease_id=l.id AND property_id=l.property_id
         ORDER BY created_at DESC,id DESC LIMIT 1
       ) renewal ON true
       LEFT JOIN LATERAL (
         SELECT state FROM lease_checkout_commands
         WHERE lease_id=l.id AND property_id=l.property_id
         ORDER BY created_at DESC,id DESC LIMIT 1
       ) checkout ON true
       LEFT JOIN LATERAL (
         SELECT GREATEST(SUM(GREATEST(i.total_amount-i.credit_amount-COALESCE(allocation.net_allocated,0),0)),0) AS outstanding_amount
         FROM invoices i
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(pa.allocated_amount),0)-COALESCE(SUM(pra.reversed_amount),0) AS net_allocated
           FROM payment_allocations pa
           LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id
           WHERE pa.invoice_id=i.id
         ) allocation ON true
         WHERE i.property_id=l.property_id AND i.lease_id=l.id
           AND i.invoice_status IN ('issued','partially_paid','overdue')
       ) arrears ON true
       WHERE l.id=$1 AND l.property_id=$2 AND l.lease_status='active' AND l.end_date IS NOT NULL`,
      [leaseId, propertyId],
    );
    return result.rows[0] ?? null;
  }

  private assertLeaseEligibility(context: LeaseReminderContext, milestone: LeaseReminderMilestone) {
    const eligible =
      milestone === 'h60'
        ? context.days_remaining >= 31 &&
          context.days_remaining <= 60 &&
          !['draft', 'approved', 'activated'].includes(context.renewal_state ?? '')
        : milestone === 'h30'
          ? context.days_remaining <= 30 && context.renewal_state !== 'activated'
          : context.days_remaining <= 14 &&
            !['completed', 'cancelled'].includes(context.checkout_state ?? '');
    if (!eligible)
      throw new ConflictException({
        code: 'REMINDER_LEASE_MILESTONE_NOT_ELIGIBLE',
        message: `Reminder ${milestone.toUpperCase()} tidak lagi berlaku untuk penyewaan ini`,
      });
  }

  private leaseReminderPreview(
    context: LeaseReminderContext,
    milestone: LeaseReminderMilestone,
    recipientKind: ReminderRecipientKind = 'resident',
  ) {
    const labels: Record<LeaseReminderMilestone, string> = {
      h60: 'niat perpanjangan (H-60)',
      h30: 'keputusan perpanjangan (H-30)',
      h14: 'persiapan akhir masa sewa (H-14)',
    };
    const titles: Record<LeaseReminderMilestone, string> = {
      h60: 'Pengingat niat perpanjangan',
      h30: 'Pengingat keputusan perpanjangan',
      h14: 'Pengingat akhir masa sewa',
    };
    const residentPrompts: Record<LeaseReminderMilestone, string> = {
      h60: 'Mohon informasikan apakah Anda berencana memperpanjang masa sewa atau tidak melanjutkan hunian.',
      h30: 'Mohon segera informasikan keputusan perpanjangan masa sewa atau tidak melanjutkan hunian.',
      h14: 'Mohon segera informasikan keputusan perpanjangan atau persiapan pengosongan kamar.',
    };
    const parentPrompts: Record<LeaseReminderMilestone, string> = {
      h60: 'Mohon informasikan apakah Bapak/Ibu berencana memperpanjang masa sewa penghuni atau tidak melanjutkan hunian.',
      h30: 'Mohon segera informasikan keputusan Bapak/Ibu terkait perpanjangan masa sewa penghuni atau tidak melanjutkan hunian.',
      h14: 'Mohon segera informasikan keputusan Bapak/Ibu terkait perpanjangan atau persiapan pengosongan kamar.',
    };
    const recipient = {
      kind: recipientKind,
      display_name: recipientDisplayName(recipientKind, context.resident_name, context.parent_name),
      room_number: formatReminderRoom({
        category: context.room_category,
        roomNumber: context.room_number,
        unitCode: context.room_unit_code,
        buildingName: context.building_name,
      }),
      phone: recipientKind === 'parent' ? context.parent_phone : context.resident_phone,
    };
    const closing =
      recipientKind === 'parent'
        ? 'Demikian informasi yang dapat kami sampaikan. Terima kasih atas kepercayaan Bapak/Ibu dalam memilih hunian bersama KOSTATION.'
        : 'Demikian informasi yang dapat kami sampaikan. Terima kasih telah mempercayakan pilihan hunian Anda kepada KOSTATION.';
    const body = [
      recipientSalutation(recipientKind, context.resident_name, context.now_hour),
      '',
      `Berikut ini adalah pesan pengingat ${labels[milestone]} dari ${propertyReminderName(context.property_name)}.`,
      `Kamar: ${recipient.room_number}`,
      `Masa sewa berakhir: ${formatReminderDate(context.lease_end_date)} (${context.days_remaining} hari lagi).`,
      `Sisa kewajiban pembayaran sewa saat ini: ${formatReminderAmount(context.outstanding_amount)}`,
      '',
      (recipientKind === 'parent' ? parentPrompts : residentPrompts)[milestone],
      '',
      closing,
    ].join('\n');
    return {
      reminder_kind: 'lease_ending' as const,
      milestone,
      lease_id: context.lease_id,
      recipient: { resident_id: context.resident_id, ...recipient },
      lease: {
        start_date: context.lease_start_date,
        end_date: context.lease_end_date,
        days_remaining: context.days_remaining,
      },
      invoice_ids: [] as string[],
      invoices: [],
      total_outstanding_amount: Number(context.outstanding_amount),
      template: { key: `lease_${milestone}_reminder`, version: 1 },
      rendered: { title: titles[milestone], body },
      channels: { whatsapp: 'manual_handoff', email: 'disabled' },
    };
  }

  private assertLeaseInput(
    input: {
      milestone: LeaseReminderMilestone;
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
    if (!['h60', 'h30', 'h14'].includes(input.milestone))
      throw new BadRequestException({
        code: 'REMINDER_LEASE_MILESTONE_INVALID',
        message: 'Milestone reminder masa sewa tidak valid',
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
      reminder_kind: row.reminder_kind ?? 'invoice',
      lease_id: row.lease_id ?? null,
      milestone: row.reminder_milestone ?? null,
      recipient_kind: row.recipient_kind ?? 'resident',
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
