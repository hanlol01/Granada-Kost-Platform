import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { UserAccessContext } from '../iam/types/iam.types';
import type { AdminActivityLogQueryDto } from './dto/admin-activity-log-query.dto';
import type { AdminActivityLogActorQueryDto } from './dto/admin-activity-log-query.dto';

type JsonObject = Record<string, unknown>;
type ActivityRow = {
  id: string;
  property_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_data: unknown;
  after_data: unknown;
  result_status: 'success' | 'failed' | 'denied';
  correlation_id: string | null;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_type: ActivityActorType;
  category: ActivityCategory;
  activity_result: ActivityResult;
  resident_id: string | null;
  resident_name: string | null;
  room_id: string | null;
  room_number: string | null;
  lease_id: string | null;
  lease_code: string | null;
  payment_id: string | null;
  payment_code: string | null;
  invoice_id: string | null;
  invoice_code: string | null;
  total_count: string;
};

type ActivityCategory =
  | 'booking'
  | 'payment'
  | 'lease'
  | 'room_occupancy'
  | 'inspection'
  | 'refund'
  | 'notification'
  | 'other';
type ActivityResult = 'succeeded' | 'pending' | 'rejected' | 'failed';
type ActivityActorType = 'admin' | 'system' | 'source';
type SafeScalar = string | number | boolean | null;

const SAFE_CHANGE_FIELDS = [
  'status',
  'state',
  'booking_status',
  'payment_status',
  'invoice_status',
  'lease_status',
  'resident_status',
  'room_status',
  'occupancy_status',
  'checkpoint_status',
  'decision_status',
  'refund_status',
  'inspection_status',
  'amount',
  'total_amount',
  'rent_credit_amount',
  'shortfall_amount',
  'checkpoint_shortfall_amount',
  'recommended_refund_amount',
  'approved_refund_amount',
  'refund_amount',
  'amount_due',
  'deposit_offset_amount',
  'deduction_amount',
  'start_date',
  'end_date',
  'due_date',
  'original_due_date',
  'extension_due_date',
  'planned_checkout_date',
  'effective_date',
  'business_date',
] as const;

const SAFE_REASON_FIELDS = [
  'reason',
  'refund_reason',
  'rejection_reason',
  'extension_reason',
  'adjustment_reason',
  'deduction_reason',
  'resolution_reason',
  'termination_reason',
  'notice_reason',
  'cancellation_reason',
] as const;

const SAFE_EVIDENCE_FIELDS = [
  'evidence_id',
  'inspection_id',
  'receipt_id',
  'document_id',
  'refund_id',
  'reversal_id',
  'termination_case_id',
  'checkout_command_id',
] as const;

const ACTION_LABELS: Readonly<Record<string, string>> = {
  'booking_lead.created': 'Minat booking dibuat',
  'booking_lead.updated': 'Minat booking diperbarui',
  'booking_lead.completed': 'Data onboarding diselesaikan',
  'booking_lead.cancelled': 'Minat booking dibatalkan',
  'booking_lead.refunded': 'Pembayaran pra-aktivasi direfund',
  'booking_lead.create_admin': 'Minat booking dibuat oleh Admin',
  'booking_lead.create_public': 'Minat booking dibuat dari formulir publik',
  'booking_lead.status_update': 'Status minat booking diperbarui',
  'booking_lead.archive_terminal': 'Minat booking terminal diarsipkan',
  'booking_lead_hold.create': 'Penahanan kamar minat booking dibuat',
  'booking_lead_hold.release': 'Penahanan kamar minat booking dilepas',
  'booking_lead_hold.expire': 'Penahanan kamar minat booking kedaluwarsa',
  'booking_lead.payment_commitment_refunded': 'Pembayaran komitmen minat booking direfund',
  'billing.cash_recorded': 'Pembayaran tunai dicatat',
  'billing.onboarding_cash_recorded': 'Pembayaran tunai onboarding dicatat',
  'billing.transfer_recorded': 'Transfer pembayaran dicatat',
  'billing.payment_verified': 'Pembayaran diverifikasi',
  'billing.payment_rejected': 'Pembayaran ditolak',
  'billing.payment_reversed': 'Pembayaran dibalik',
  'billing.payment_proof_submitted': 'Bukti pembayaran dikirim',
  'billing.payment_proof_verified': 'Bukti pembayaran diverifikasi',
  'billing.payment_proof_rejected': 'Bukti pembayaran ditolak',
  'billing.other_charge_created': 'Tagihan tambahan dibuat',
  'billing.invoice_voided': 'Invoice dibatalkan',
  'lease.activate': 'Penyewaan diaktifkan',
  'lease.activation_completed': 'Penyewaan diaktifkan',
  'lease.activation_attention_required': 'Aktivasi memerlukan tindakan Admin',
  'lease.automatic_activation_failed': 'Aktivasi otomatis gagal',
  'lease.check_in_confirmation_required': 'Konfirmasi check-in diperlukan',
  'lease.check_in_confirm': 'Check-in penghuni dikonfirmasi',
  'lease.checkout.notice': 'Pengajuan check-out dicatat',
  'lease.checkout.notice_recorded': 'Pemberitahuan check-out disimpan',
  'lease.checkout.schedule': 'Jadwal check-out disetujui',
  'lease.checkout.handover': 'Serah terima check-out dicatat',
  'lease.checkout.inspection': 'Inspeksi check-out dicatat',
  'lease.checkout.cancel': 'Proses check-out dibatalkan',
  'lease.checkout.complete': 'Check-out diselesaikan',
  'lease.checkout.completed': 'Check-out selesai dan penyewaan ditutup',
  'lease.checkout.access_reconciliation_requested': 'Rekonsiliasi akses kamar diminta',
  'lease.checkout.refund_settled': 'Refund check-out diselesaikan',
  'lease.checkout.refund_waived': 'Refund check-out dilepas',
  'lease.checkout.document_issued': 'Dokumen resmi check-out diterbitkan',
  'lease.checkout_completed': 'Check-out diselesaikan',
  'lease.contract_settlement_extended': 'Tenggat pelunasan diperpanjang',
  'lease.payment_promise_recorded': 'Janji bayar dicatat',
  'lease.termination_started': 'Proses pemberhentian sewa dimulai',
  'lease.termination_cancelled_after_settlement': 'Pemberhentian dibatalkan setelah pelunasan',
  'lease.termination_checked_out': 'Pemberhentian diselesaikan melalui check-out',
  'lease.settlement_overdue_started': 'Checkpoint mulai terlambat',
  'lease.settlement_grace_started': 'Masa toleransi dimulai',
  'lease.settlement_admin_action_required': 'Tindakan Admin diperlukan',
  'lease.settlement_termination_eligible': 'Penyewaan memenuhi syarat terminasi',
  'lease.settlement_extension_expiring': 'Perpanjangan tenggat segera berakhir',
  'lease.settlement_extension_expired': 'Perpanjangan tenggat telah berakhir',
  'room.status_update': 'Status kamar diperbarui',
  'room.inspection_resolution': 'Keputusan inspeksi kamar dicatat',
  'room.inspection_resolved': 'Inspeksi kamar diselesaikan',
  'reminder.invoice_share.issued': 'Pengingat invoice dibagikan',
  'reminder.attempt.created': 'Upaya pengingat dibuat',
  'resident.account_provision': 'Akun penghuni dibuat',
  'resident.account_password_reset': 'Kata sandi akun penghuni direset',
  'resident.onboarding_commit': 'Onboarding penghuni dikonfirmasi',
  'resident.update': 'Data penghuni diperbarui',
  'kost_type_content.gallery_publish': 'Galeri tipe kost dipublikasikan',
  'kost_type_content.gallery_unpublish': 'Galeri tipe kost dibatalkan publikasinya',
  'hunian_gallery.attach.v2': 'Galeri hunian ditambahkan',
  'hunian_gallery.archive.v2': 'Galeri hunian diarsipkan',
  'hunian_gallery.set_cover.v2': 'Sampul galeri hunian diperbarui',
  'property_owner.created': 'Data pemilik properti dibuat',
  'property_owner.assignment_created': 'Pemilik ditetapkan pada properti',
  'file.upload': 'File diunggah',
  'file.upload.failed': 'Unggahan file gagal',
  'file.download': 'File diunduh',
  'file.delete': 'File dihapus',
  'notification.lease_settlement_created': 'Notifikasi pelunasan dibuat',
  'notification.read': 'Notifikasi ditandai dibaca',
  'notification.archive': 'Notifikasi diarsipkan',
};

@Injectable()
export class ActivityLogService {
  constructor(private readonly database: DatabaseService) {}

  async list(user: UserAccessContext, query: AdminActivityLogQueryDto) {
    this.assertPropertyScope(user, query.property_id);
    this.assertDateRange(query.from, query.to);
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const result = await this.queryRows(query, limit, offset);
    return {
      data: result.rows.map((row) => this.toResponse(row)),
      meta: {
        limit,
        offset,
        total: this.total(result.rows),
        timezone: 'Asia/Jakarta' as const,
        default_range_days: 30,
      },
    };
  }

  async detail(user: UserAccessContext, propertyId: string, activityId: string) {
    this.assertPropertyScope(user, propertyId);
    const result = await this.queryRows({ property_id: propertyId }, 1, 0, activityId);
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: 'ACTIVITY_LOG_EVENT_NOT_FOUND',
        message: 'Activity event was not found in the authorised property scope',
      });
    return { data: this.toResponse(row) };
  }

  async actors(user: UserAccessContext, query: AdminActivityLogActorQueryDto) {
    this.assertPropertyScope(user, query.property_id);
    this.assertDateRange(query.from, query.to);
    const result = await this.database.client.query<{
      actor_user_id: string | null;
      display_name: string | null;
      actor_type: ActivityActorType;
      event_count: string;
    }>(
      `SELECT audit.actor_user_id,account.display_name,
              CASE WHEN audit.actor_user_id IS NULL THEN 'system'
                   WHEN EXISTS (
                     SELECT 1 FROM user_property_roles membership
                     JOIN roles role ON role.id=membership.role_id AND role.code='admin'
                     WHERE membership.user_id=audit.actor_user_id
                       AND membership.property_id=audit.property_id
                       AND membership.revoked_at IS NULL
                   ) THEN 'admin' ELSE 'source' END AS actor_type,
              count(*)::text AS event_count
         FROM audit_logs audit
         LEFT JOIN users account ON account.id=audit.actor_user_id
        WHERE audit.property_id=$1
          AND audit.occurred_at >= COALESCE($2::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date-30)::timestamp AT TIME ZONE 'Asia/Jakarta'
          AND audit.occurred_at < (COALESCE($3::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)+1)::timestamp AT TIME ZONE 'Asia/Jakarta'
        GROUP BY audit.actor_user_id,account.display_name,audit.property_id
        ORDER BY CASE WHEN audit.actor_user_id IS NULL THEN 0 ELSE 1 END,
                 account.display_name NULLS LAST`,
      [query.property_id, query.from ?? null, query.to ?? null],
    );
    return {
      data: result.rows.map((row) => ({
        id: row.actor_user_id,
        type: row.actor_type,
        display_name:
          row.actor_type === 'system'
            ? 'System'
            : (row.display_name ?? (row.actor_type === 'admin' ? 'Admin' : 'Sumber terotorisasi')),
        event_count: this.count(row.event_count),
      })),
    };
  }

  private async queryRows(
    query: AdminActivityLogQueryDto,
    limit: number,
    offset: number,
    activityId?: string,
  ) {
    return this.database.client.query<ActivityRow>(
      `/* admin_activity_log_m9 */
       WITH activity_context AS (
         SELECT audit.id,audit.property_id,audit.action,audit.resource_type,audit.resource_id,
                audit.before_data,audit.after_data,audit.result_status,audit.correlation_id,
                 audit.occurred_at,audit.actor_user_id,actor.display_name AS actor_display_name,
                 CASE WHEN audit.actor_user_id IS NULL THEN 'system'
                      WHEN EXISTS (
                        SELECT 1 FROM user_property_roles membership
                        JOIN roles role ON role.id=membership.role_id AND role.code='admin'
                        WHERE membership.user_id=audit.actor_user_id
                          AND membership.property_id=audit.property_id
                          AND membership.revoked_at IS NULL
                      ) THEN 'admin' ELSE 'source' END AS actor_type,
                CASE
                  WHEN audit.action ILIKE '%refund%' OR audit.action ILIKE '%reversal%' THEN 'refund'
                  WHEN audit.action LIKE 'booking%' OR audit.action LIKE 'onboarding%' THEN 'booking'
                  WHEN audit.action LIKE 'billing%' OR audit.action LIKE 'payment%' OR audit.action LIKE 'invoice%' OR audit.action LIKE 'lease.settlement%' THEN 'payment'
                  WHEN audit.action ILIKE '%inspection%' THEN 'inspection'
                  WHEN audit.action ILIKE '%checkout%' OR audit.action ILIKE '%termination%' OR audit.action LIKE 'lease.%' THEN 'lease'
                  WHEN audit.action LIKE 'room.%' OR audit.action LIKE 'occupancy.%' THEN 'room_occupancy'
                  WHEN audit.action LIKE 'notification.%' OR audit.action LIKE 'reminder.%' THEN 'notification'
                  ELSE 'other'
                END AS category,
                CASE audit.result_status WHEN 'success' THEN 'succeeded'
                     WHEN 'denied' THEN 'rejected' ELSE 'failed' END AS activity_result,
                resident.id AS resident_id,resident.full_name AS resident_name,
                room.id AS room_id,room.number AS room_number,
                lease.id AS lease_id,lease.lease_code,
                payment.id AS payment_id,payment.payment_code,
                invoice.id AS invoice_id,invoice.invoice_code
           FROM audit_logs audit
           LEFT JOIN users actor ON actor.id=audit.actor_user_id
           LEFT JOIN payment_reversals reversal
             ON audit.resource_type='payment_reversal' AND reversal.id=audit.resource_id
            AND reversal.property_id=audit.property_id
           LEFT JOIN payments payment
             ON payment.property_id=audit.property_id
            AND payment.id=CASE WHEN audit.resource_type='payment' THEN audit.resource_id
                                WHEN audit.resource_type='payment_reversal' THEN reversal.payment_id END
           LEFT JOIN payment_proofs proof
             ON audit.resource_type='payment_proof' AND proof.id=audit.resource_id
            AND proof.property_id=audit.property_id
           LEFT JOIN invoices invoice
             ON invoice.property_id=audit.property_id
            AND invoice.id=CASE WHEN audit.resource_type='invoice' THEN audit.resource_id
                               WHEN audit.resource_type='payment_proof' THEN proof.invoice_id END
           LEFT JOIN lease_checkout_commands checkout
             ON audit.resource_type='lease_checkout_command' AND checkout.id=audit.resource_id
            AND checkout.property_id=audit.property_id
           LEFT JOIN lease_deposit_transactions deposit
             ON audit.resource_type='lease_deposit_transaction' AND deposit.id=audit.resource_id
            AND deposit.property_id=audit.property_id
           LEFT JOIN lease_settlement_checkpoints checkpoint
             ON audit.resource_type='lease_settlement_checkpoint' AND checkpoint.id=audit.resource_id
            AND checkpoint.property_id=audit.property_id
           LEFT JOIN occupancies occupancy
             ON audit.resource_type='occupancy' AND occupancy.id=audit.resource_id
            AND occupancy.property_id=audit.property_id
           LEFT JOIN leases lease
             ON lease.property_id=audit.property_id
            AND lease.id=COALESCE(
              CASE WHEN audit.resource_type='lease' THEN audit.resource_id END,
              payment.lease_id,invoice.lease_id,checkout.lease_id,deposit.lease_id,checkpoint.lease_id,
              (SELECT scoped_lease.id FROM leases scoped_lease
                WHERE scoped_lease.property_id=audit.property_id
                  AND scoped_lease.occupancy_id=occupancy.id
                ORDER BY scoped_lease.created_at DESC LIMIT 1)
            )
           LEFT JOIN residents resident
             ON resident.property_id=audit.property_id
            AND resident.id=COALESCE(lease.resident_id,
              CASE WHEN audit.resource_type='resident' THEN audit.resource_id END,
              occupancy.resident_id,checkout.resident_id)
           LEFT JOIN rooms room
             ON room.property_id=audit.property_id
            AND room.id=COALESCE(lease.room_id,
              CASE WHEN audit.resource_type='room' THEN audit.resource_id END,
              occupancy.room_id,checkout.room_id)
          WHERE audit.property_id=$1
            AND audit.occurred_at >= COALESCE($2::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date-30)::timestamp AT TIME ZONE 'Asia/Jakarta'
            AND audit.occurred_at < (COALESCE($3::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)+1)::timestamp AT TIME ZONE 'Asia/Jakarta'
            AND ($4::uuid IS NULL OR audit.actor_user_id=$4)
            AND ($15::uuid IS NULL OR audit.id=$15)
        ), filtered AS (
         SELECT activity_context.*
           FROM activity_context
           WHERE ($5::text IS NULL OR category=$5)
             AND ($16::text IS NULL OR actor_type=$16)
            AND ($6::text IS NULL OR action ILIKE '%'||$6||'%')
            AND ($7::text IS NULL OR activity_result=$7)
            AND ($8::text IS NULL OR concat_ws(' ',action,resource_type,resource_id::text,
                 actor_display_name,resident_name,room_number,lease_code,payment_code,invoice_code,
                 correlation_id) ILIKE '%'||$8||'%')
            AND ($9::uuid IS NULL OR room_id=$9)
            AND ($10::uuid IS NULL OR resident_id=$10)
            AND ($11::uuid IS NULL OR lease_id=$11)
            AND ($12::text IS NULL OR concat_ws(' ',resource_id::text,payment_code,invoice_code,
                 lease_code,correlation_id) ILIKE '%'||$12||'%')
       )
       SELECT filtered.*,count(*) OVER()::text AS total_count
         FROM filtered
        ORDER BY occurred_at DESC,id DESC
        LIMIT $13 OFFSET $14`,
      [
        query.property_id,
        query.from ?? null,
        query.to ?? null,
        query.actor_id ?? null,
        query.category ?? null,
        query.action ?? null,
        query.result ?? null,
        query.target ?? null,
        query.room_id ?? null,
        query.resident_id ?? null,
        query.lease_id ?? null,
        query.reference ?? null,
        limit,
        offset,
        activityId ?? null,
        query.actor_type ?? null,
      ],
    );
  }

  private toResponse(row: ActivityRow) {
    const before = this.object(row.before_data);
    const after = this.object(row.after_data);
    return {
      id: row.id,
      event_type: row.action,
      action_label: ACTION_LABELS[row.action] ?? this.humanize(row.action),
      category: row.category,
      result: row.activity_result,
      occurred_at: row.occurred_at.toISOString(),
      actor: {
        id: row.actor_user_id,
        type: row.actor_type,
        display_name:
          row.actor_type === 'system'
            ? 'System'
            : (row.actor_display_name ??
              (row.actor_type === 'admin' ? 'Admin' : 'Sumber terotorisasi')),
      },
      target: {
        property_id: row.property_id,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        resident: row.resident_id
          ? { id: row.resident_id, display_name: row.resident_name ?? 'Penghuni' }
          : null,
        room: row.room_id ? { id: row.room_id, number: row.room_number ?? 'Kamar' } : null,
        lease: row.lease_id ? { id: row.lease_id, code: row.lease_code ?? 'Penyewaan' } : null,
        payment: row.payment_id
          ? { id: row.payment_id, code: row.payment_code ?? 'Pembayaran' }
          : null,
        invoice: row.invoice_id
          ? { id: row.invoice_id, code: row.invoice_code ?? 'Invoice' }
          : null,
      },
      change_summary: this.changeSummary(before, after),
      reason: this.reason(after) ?? this.reason(before),
      evidence_references: this.evidenceReferences(after),
      correlation_id: row.correlation_id,
    };
  }

  private changeSummary(before: JsonObject, after: JsonObject) {
    return SAFE_CHANGE_FIELDS.flatMap((field) => {
      const beforeValue = this.scalar(before[field]);
      const afterValue = this.scalar(after[field]);
      if (beforeValue === undefined && afterValue === undefined) return [];
      if (beforeValue === afterValue) return [];
      return [{ field, before: beforeValue ?? null, after: afterValue ?? null }];
    }).slice(0, 8);
  }

  private reason(data: JsonObject): string | null {
    for (const field of SAFE_REASON_FIELDS) {
      const value = data[field];
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
    }
    return null;
  }

  private evidenceReferences(data: JsonObject) {
    return SAFE_EVIDENCE_FIELDS.flatMap((field) => {
      const value = data[field];
      return typeof value === 'string' && value.trim()
        ? [{ kind: field, reference: value.trim().slice(0, 160) }]
        : [];
    });
  }

  private scalar(value: unknown): SafeScalar | undefined {
    if (value === null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return value.slice(0, 160);
    return undefined;
  }

  private object(value: unknown): JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
  }

  private humanize(value: string) {
    return value
      .replaceAll('.', ' ')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private total(rows: ActivityRow[]) {
    return this.count(rows[0]?.total_count ?? '0');
  }

  private count(value: string) {
    const total = Number(value);
    if (!Number.isSafeInteger(total) || total < 0)
      throw new BadRequestException({
        code: 'ACTIVITY_LOG_COUNT_INVALID',
        message: 'Activity log count requires reconciliation',
      });
    return total;
  }

  private assertPropertyScope(user: UserAccessContext, propertyId: string) {
    if (!user.propertyIds.includes(propertyId))
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property activity log',
      });
  }

  private assertDateRange(from?: string, to?: string) {
    if ((from && !this.validDate(from)) || (to && !this.validDate(to)))
      throw new BadRequestException({
        code: 'ACTIVITY_LOG_DATE_INVALID',
        message: 'Activity log dates must be valid calendar dates',
      });
    if (from && to && from > to)
      throw new BadRequestException({
        code: 'ACTIVITY_LOG_DATE_RANGE_INVALID',
        message: 'Activity log start date must not be after the end date',
      });
  }

  private validDate(value: string) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
}
