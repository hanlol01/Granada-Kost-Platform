import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { PropertyService } from '../property/property.service';

const PROTECTED_VARIABLES = [
  '{{resident_name}}',
  '{{room_number}}',
  '{{property_name}}',
  '{{invoice_periods}}',
  '{{invoice_total_outstanding}}',
  '{{lease_start_date}}',
  '{{lease_end_date}}',
  '{{payment_due_date}}',
  '{{days_remaining}}',
  '{{admin_whatsapp}}',
  '{{invoice_download_links}}',
] as const;

type InvoiceRow = {
  id: string;
  resident_id: string;
  lease_id: string;
  invoice_status: string;
  invoice_code: string;
  resident_name: string;
  room_number: string;
  property_name: string;
  resident_phone: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  lease_start: string;
  lease_end: string | null;
  outstanding_amount: string;
  now_date: string;
  admin_whatsapp: string | null;
};

type ReminderTemplate = {
  id?: string;
  template_key: string;
  version: number;
  title_template: string;
  body_template: string;
  protected_variables: readonly string[];
  created_at?: string;
};

@Injectable()
export class ReminderComposerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
    private readonly billing: W06BillingService,
  ) {}

  async activeTemplate(user: UserAccessContext, propertyId: string) {
    await this.properties.get(user, propertyId);
    const result = await this.database.client.query<ReminderTemplate>(
      `SELECT id, template_key, version, title_template, body_template, protected_variables, created_at
       FROM reminder_templates WHERE property_id=$1 AND template_key='invoice_reminder' AND status='active'`,
      [propertyId],
    );
    return result.rows[0] ?? this.defaultTemplate();
  }

  async createVersion(
    user: UserAccessContext,
    propertyId: string,
    input: { title_template: string; body_template: string },
    idempotencyKey: string | undefined,
  ): Promise<ReminderTemplate> {
    await this.properties.get(user, propertyId);
    if (!idempotencyKey?.trim())
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required',
      });
    this.assertTemplate(input.title_template, input.body_template);
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ response_body: unknown; request_fingerprint: string }>(
        `SELECT response_body, request_fingerprint FROM idempotency_commands
         WHERE property_id=$1 AND actor_user_id=$2 AND route='POST:/admin/reminders/templates' AND idempotency_key=$3 FOR UPDATE`,
        [propertyId, user.id, idempotencyKey],
      );
      const fingerprint = JSON.stringify(input);
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was reused with different data',
          });
        return existing.rows[0].response_body as ReminderTemplate;
      }
      await client.query(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,command_status)
         VALUES($1,$2,'POST:/admin/reminders/templates',$3,$4,'pending')`,
        [propertyId, user.id, idempotencyKey, fingerprint],
      );
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':invoice_reminder'))`, [
        propertyId,
      ]);
      const version = await client.query<{ version: number }>(
        `SELECT COALESCE(max(version),0)+1 AS version
         FROM reminder_templates WHERE property_id=$1 AND template_key='invoice_reminder'`,
        [propertyId],
      );
      await client.query(
        `UPDATE reminder_templates SET status='archived', archived_at=now() WHERE property_id=$1 AND template_key='invoice_reminder' AND status='active'`,
        [propertyId],
      );
      const inserted = await client.query<ReminderTemplate>(
        `INSERT INTO reminder_templates(property_id,template_key,version,title_template,body_template,protected_variables,created_by_user_id)
         VALUES($1,'invoice_reminder',$2,$3,$4,$5::text[],$6)
         RETURNING id,template_key,version,title_template,body_template,protected_variables,created_at`,
        [
          propertyId,
          version.rows[0].version,
          input.title_template.trim(),
          input.body_template.trim(),
          PROTECTED_VARIABLES,
          user.id,
        ],
      );
      const response = inserted.rows[0];
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'reminder.template.version_created',
          resourceType: 'reminder_template',
          resourceId: inserted.rows[0].id,
          afterData: { version: inserted.rows[0].version },
          resultStatus: 'success',
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,actor_user_id) VALUES($1,$2,'reminder.template.version_created','reminder_template',$3,$4::jsonb,$5) ON CONFLICT(event_key) DO NOTHING`,
        [
          propertyId,
          `reminder.template.version_created:${inserted.rows[0].id}`,
          inserted.rows[0].id,
          JSON.stringify({ version: inserted.rows[0].version }),
          user.id,
        ],
      );
      await client.query(
        `UPDATE idempotency_commands
         SET command_status='succeeded', response_status=201, response_body=$4::jsonb, completed_at=now()
         WHERE property_id=$1 AND actor_user_id=$2 AND route='POST:/admin/reminders/templates' AND idempotency_key=$3`,
        [propertyId, user.id, idempotencyKey, JSON.stringify(response)],
      );
      return response;
    });
  }

  async currentMonthPreview(user: UserAccessContext, propertyId: string, invoiceId: string) {
    await this.properties.get(user, propertyId);
    const invoice = await this.loadInvoices(propertyId, [invoiceId]);
    if (invoice.length !== 1)
      throw new NotFoundException({
        code: 'REMINDER_INVOICE_NOT_FOUND',
        message: 'Invoice tidak ditemukan dalam properti ini',
      });
    return this.preview(user, propertyId, invoice);
  }

  async residentPreview(
    user: UserAccessContext,
    propertyId: string,
    residentId: string,
    invoiceIds: string[],
  ) {
    await this.properties.get(user, propertyId);
    const invoices = await this.loadInvoices(propertyId, invoiceIds);
    if (
      invoices.length !== new Set(invoiceIds).size ||
      invoices.some((invoice) => invoice.resident_id !== residentId)
    )
      throw new BadRequestException({
        code: 'REMINDER_INVOICE_SELECTION_INVALID',
        message: 'Pilih tagihan aktif milik penghuni yang sama',
      });
    return this.preview(user, propertyId, invoices);
  }

  async whatsappHandoff(
    user: UserAccessContext,
    propertyId: string,
    residentId: string,
    invoiceIds: string[],
  ) {
    const preview = await this.residentPreview(user, propertyId, residentId, invoiceIds);
    const phone = preview.recipient.phone?.replace(/\D/g, '');
    if (!phone)
      throw new BadRequestException({
        code: 'REMINDER_RECIPIENT_PHONE_MISSING',
        message: 'Nomor WhatsApp penghuni belum tersedia',
      });
    return {
      channel: 'whatsapp_manual',
      url: `https://wa.me/${phone.replace(/^0/, '62')}?text=${encodeURIComponent(preview.rendered.body)}`,
      preview,
    };
  }

  emailDisabled() {
    throw new ConflictException({
      code: 'EMAIL_DELIVERY_DISABLED',
      message: 'Pengiriman email belum diaktifkan. Gunakan preview atau WhatsApp manual.',
    });
  }

  async sharedInvoiceDocument(token: string) {
    const hash = createHash('sha256').update(token).digest('hex');
    const link = await this.database.client.query<{ property_id: string; invoice_id: string }>(
      `SELECT link.property_id,link.invoice_id FROM reminder_invoice_share_links link
       JOIN invoices invoice ON invoice.id=link.invoice_id AND invoice.property_id=link.property_id
       WHERE link.token_hash=$1 AND link.revoked_at IS NULL AND link.expires_at>now()
         AND invoice.invoice_status<>'void'`,
      [hash],
    );
    if (link.rows.length !== 1)
      throw new NotFoundException({
        code: 'REMINDER_SHARE_LINK_INVALID',
        message: 'Tautan tagihan tidak valid atau sudah kedaluwarsa',
      });
    const record = link.rows[0];
    const document = await this.billing.sharedInvoiceDocument(
      record.property_id,
      record.invoice_id,
    );
    await this.audit.write({
      propertyId: record.property_id,
      action: 'reminder.invoice_share.opened',
      resourceType: 'invoice_share_link',
      resourceId: record.invoice_id,
      resultStatus: 'success',
    });
    return document;
  }

  private async preview(user: UserAccessContext, propertyId: string, invoices: InvoiceRow[]) {
    this.assertOutstanding(invoices);
    const template = await this.activeTemplate(user, propertyId);
    const links = await Promise.all(
      invoices.map((invoice) => this.issueShareLink(propertyId, invoice.id, user.id)),
    );
    const first = invoices[0];
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount), 0);
    const variables: Record<string, string> = {
      '{{resident_name}}': first.resident_name,
      '{{room_number}}': first.room_number,
      '{{property_name}}': first.property_name,
      '{{invoice_periods}}': invoices
        .map((invoice) => `${invoice.period_start}–${invoice.period_end}`)
        .join(', '),
      '{{invoice_total_outstanding}}': new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(total),
      '{{lease_start_date}}': first.lease_start,
      '{{lease_end_date}}': first.lease_end ?? 'Tidak ditentukan',
      '{{payment_due_date}}': invoices.map((invoice) => invoice.due_date).sort()[0],
      '{{days_remaining}}': String(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(invoices.map((invoice) => invoice.due_date).sort()[0]) -
              Date.parse(first.now_date)) /
              86400000,
          ),
        ),
      ),
      '{{admin_whatsapp}}': first.admin_whatsapp ?? 'Belum ditentukan',
      '{{invoice_download_links}}': links
        .map((link, index) => `Tagihan ${invoices[index].invoice_code}: ${link}`)
        .join('\n'),
    };
    return {
      template: { key: template.template_key, version: template.version },
      recipient: {
        resident_id: first.resident_id,
        display_name: first.resident_name,
        room_number: first.room_number,
        phone: first.resident_phone,
      },
      invoice_ids: invoices.map((invoice) => invoice.id),
      invoices: invoices.map((invoice, index) => ({
        id: invoice.id,
        code: invoice.invoice_code,
        period: `${invoice.period_start}–${invoice.period_end}`,
        due_date: invoice.due_date,
        outstanding_amount: Number(invoice.outstanding_amount),
        share_url: links[index],
      })),
      total_outstanding_amount: total,
      rendered: {
        title: this.render(template.title_template, variables),
        body: this.render(template.body_template, variables),
      },
      channels: { whatsapp: 'manual_handoff', email: 'disabled' },
    };
  }

  private async loadInvoices(propertyId: string, invoiceIds: string[]) {
    const result = await this.database.client.query<InvoiceRow>(
      `SELECT i.id,i.resident_id,i.lease_id,i.invoice_status,i.invoice_code,i.snapshot_resident_name AS resident_name,i.snapshot_room_number AS room_number,
              p.name AS property_name,r.phone AS resident_phone,i.snapshot_period_start_date::text AS period_start,i.snapshot_period_end_date::text AS period_end,
              i.due_date::text,l.start_date::text AS lease_start,l.end_date::text AS lease_end,
              GREATEST(i.total_amount-COALESCE(i.credit_amount,0)-COALESCE(a.allocated_amount,0),0)::text AS outstanding_amount,
              (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS now_date,p.phone AS admin_whatsapp
       FROM invoices i JOIN properties p ON p.id=i.property_id JOIN residents r ON r.id=i.resident_id JOIN leases l ON l.id=i.lease_id
       LEFT JOIN LATERAL (SELECT COALESCE(sum(pa.allocated_amount),0)-COALESCE(sum(pra.reversed_amount),0) AS allocated_amount FROM payment_allocations pa LEFT JOIN payment_reversal_allocations pra ON pra.original_allocation_id=pa.id WHERE pa.invoice_id=i.id AND pa.allocation_status='active') a ON TRUE
       WHERE i.property_id=$1 AND i.id=ANY($2::uuid[])`,
      [propertyId, invoiceIds],
    );
    return result.rows;
  }

  private async issueShareLink(propertyId: string, invoiceId: string, actorUserId: string) {
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE reminder_invoice_share_links SET revoked_at=now() WHERE property_id=$1 AND invoice_id=$2 AND revoked_at IS NULL`,
        [propertyId, invoiceId],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO reminder_invoice_share_links(property_id,invoice_id,token_hash,expires_at,created_by_user_id)
         VALUES($1,$2,$3,now()+interval '7 days',$4) RETURNING id`,
        [propertyId, invoiceId, hash, actorUserId],
      );
      const linkId = inserted.rows[0].id;
      await this.audit.write(
        {
          actorUserId,
          propertyId,
          action: 'reminder.invoice_share.issued',
          resourceType: 'invoice_share_link',
          resourceId: linkId,
          afterData: { invoiceId, expiresInDays: 7 },
          resultStatus: 'success',
        },
        client,
      );
      await client.query(
        `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
         VALUES($1,$2,'reminder.invoice_share.issued','invoice_share_link',$3,$4::jsonb,$5)
         ON CONFLICT(event_key) DO NOTHING`,
        [
          propertyId,
          `reminder.invoice_share.issued:${linkId}`,
          linkId,
          JSON.stringify({ invoice_id: invoiceId, expires_in_days: 7 }),
          actorUserId,
        ],
      );
    });
    return `/api/v1/reminders/invoice-share/${token}`;
  }

  private assertOutstanding(invoices: InvoiceRow[]) {
    if (
      !invoices.length ||
      invoices.some(
        (invoice) =>
          !['issued', 'unpaid', 'partially_paid', 'overdue'].includes(invoice.invoice_status) ||
          Number(invoice.outstanding_amount) <= 0,
      )
    )
      throw new ConflictException({
        code: 'REMINDER_INVOICE_NOT_ELIGIBLE',
        message: 'Tagihan sudah lunas, dibatalkan, atau tidak lagi dapat diingatkan',
      });
  }
  private assertTemplate(title: string, body: string) {
    const value = `${title}\n${body}`;
    if (/<\/?script\b|javascript:|<iframe\b/i.test(value))
      throw new BadRequestException({
        code: 'REMINDER_TEMPLATE_UNSAFE_CONTENT',
        message: 'Template tidak boleh berisi script atau HTML tidak aman',
      });
    const variables: string[] = value.match(/{{[^}]+}}/g) ?? [];
    if (
      variables.some(
        (variable) =>
          !PROTECTED_VARIABLES.includes(variable as (typeof PROTECTED_VARIABLES)[number]),
      )
    )
      throw new BadRequestException({
        code: 'REMINDER_TEMPLATE_VARIABLE_INVALID',
        message: 'Template memakai variabel yang tidak dikenal',
      });
    if (PROTECTED_VARIABLES.some((variable) => !variables.includes(variable)))
      throw new BadRequestException({
        code: 'REMINDER_TEMPLATE_VARIABLE_REQUIRED',
        message: 'Variabel terlindungi tidak boleh dihapus atau diganti',
      });
  }
  private render(template: string, variables: Record<string, string>) {
    return Object.entries(variables).reduce(
      (result, [name, value]) => result.split(name).join(value),
      template,
    );
  }
  private defaultTemplate() {
    return {
      template_key: 'invoice_reminder',
      version: 1,
      title_template: 'Pengingat tagihan {{property_name}}',
      body_template:
        'Halo {{resident_name}},\nKamar: {{room_number}}\nPeriode: {{invoice_periods}}\nSisa tagihan: {{invoice_total_outstanding}}\nJatuh tempo: {{payment_due_date}} ({{days_remaining}} hari)\nMasa sewa: {{lease_start_date}}–{{lease_end_date}}\nAdmin: {{admin_whatsapp}}\n{{invoice_download_links}}',
      protected_variables: PROTECTED_VARIABLES,
    };
  }
}
