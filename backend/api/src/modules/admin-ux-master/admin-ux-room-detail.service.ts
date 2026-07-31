import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { v2Data } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { GetRoomByNumberV2QueryDto } from './admin-ux-room-v2.dto';
import type { AdminRoomDetailProjection } from './admin-ux-room-detail.types';

type Row = Record<string, unknown>;

function flattenValidationErrors(errors: ValidationError[]): Record<string, string[]> {
  return Object.fromEntries(
    errors.map((error) => [error.property, Object.values(error.constraints ?? {})]),
  );
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ConflictException({
      code: 'ROOM_DETAIL_PROJECTION_INVALID',
      message: 'Room detail authority could not be projected safely.',
    });
  }
  return parsed;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

function leaseDurationMonths(startValue: unknown, endValue: unknown): number {
  const start = new Date(iso(startValue));
  const end = endValue ? new Date(iso(endValue)) : null;
  if (!end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const wholeMonths =
    (endExclusive.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    endExclusive.getUTCMonth() -
    start.getUTCMonth();
  return Math.max(0, wholeMonths + (endExclusive.getUTCDate() >= start.getUTCDate() ? 0 : -1));
}

const TIMELINE_LABELS: Readonly<Record<string, string>> = {
  room_updated: 'Inventori kamar diperbarui',
  hold_created: 'Kamar ditahan untuk minat booking',
  hold_released: 'Hold kamar dilepas',
  hold_expired: 'Hold kamar kedaluwarsa',
  occupancy_check_in: 'Penghuni check-in',
  occupancy_check_out: 'Penghuni check-out',
  lease_created: 'Penyewaan diaktifkan',
  lease_updated: 'Penyewaan diperbarui',
  lease_invoice_generated: 'Tagihan penyewaan dibuat',
  lease_deposit_collected: 'Deposit jaminan diterima',
  lease_deposit_refunded: 'Deposit jaminan dikembalikan',
  lease_deposit_deducted: 'Deposit jaminan dipotong',
  lease_closed: 'Penyewaan ditutup',
  lease_transferred_out: 'Penyewaan dipindahkan dari kamar',
  lease_transferred_in: 'Penyewaan dipindahkan ke kamar',
  maintenance_open: 'Work order perawatan dibuka',
  maintenance_assigned: 'Work order perawatan ditugaskan',
  maintenance_in_progress: 'Perawatan sedang dikerjakan',
  maintenance_on_hold: 'Perawatan ditunda',
  maintenance_completed: 'Perawatan diselesaikan',
  maintenance_verified: 'Perawatan diverifikasi',
  maintenance_cancelled: 'Perawatan dibatalkan',
};

@Injectable()
export class AdminUxRoomDetailService {
  private readonly queryValidation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: flattenValidationErrors(errors),
      }),
  });

  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
  ) {}

  async getByNumber(user: UserAccessContext, rawRoomNumber: string, rawQuery: unknown) {
    this.assertAdminRole(user);
    const query = (await this.queryValidation.transform(rawQuery, {
      type: 'query',
      metatype: GetRoomByNumberV2QueryDto,
    })) as GetRoomByNumberV2QueryDto;
    await this.properties.assertCanReadProperty(user, query.property_id);
    const roomNumber = this.normalizeRoomNumber(rawRoomNumber);

    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return this.getSnapshot(client, query.property_id, roomNumber);
    });
  }

  private async getSnapshot(client: PoolClient, propertyIdInput: string, roomNumber: string) {
    const room = await this.roomIdentity(client, propertyIdInput, roomNumber);
    const propertyId = text(room.property_id);
    const roomId = text(room.id);

    const [facilitiesResult, occupancyResult, leaseResult] = await Promise.all([
      client.query<Row>(
        `SELECT facility.id, facility.name
           FROM kost_type_facility_assignments assignment
           JOIN room_facilities facility
             ON facility.id = assignment.facility_id
            AND facility.property_id = $1
           WHERE assignment.kost_type_id = $2
           ORDER BY facility.sort_order, facility.name, facility.id`,
        [propertyId, room.kost_type_id],
      ),
      client.query<Row>(
        `SELECT occupancy.id, occupancy.resident_id, occupancy.start_date, occupancy.end_date,
                  occupancy.occupancy_status, resident.full_name,
                  COALESCE(account.user_status, resident.resident_status) AS account_status
           FROM occupancies occupancy
           JOIN residents resident
             ON resident.id = occupancy.resident_id
            AND resident.property_id = occupancy.property_id
           LEFT JOIN users account ON account.id = resident.user_id
           WHERE occupancy.property_id = $1
             AND occupancy.room_id = $2
             AND occupancy.occupancy_status = 'active'
           ORDER BY occupancy.start_date, occupancy.id`,
        [propertyId, roomId],
      ),
      client.query<Row>(
        `SELECT lease.id, lease.lease_code, lease.lease_status, lease.start_date, lease.end_date,
                  lease.billing_cycle, lease.occupancy_id, lease.resident_id,
                  lease.snapshot_yearly_price, lease.snapshot_deposit_amount,
                  lease.deposit_collected_amount, lease.deposit_refunded_amount,
                  lease.deposit_deduction_amount
           FROM leases lease
           WHERE lease.property_id = $1
             AND lease.room_id = $2
             AND lease.lease_status = 'active'
           ORDER BY lease.start_date, lease.id`,
        [propertyId, roomId],
      ),
    ]);

    if (occupancyResult.rows.length > 1) this.throwAmbiguous('ROOM_ACTIVE_OCCUPANCY_AMBIGUOUS');
    if (leaseResult.rows.length > 1) this.throwAmbiguous('ROOM_ACTIVE_LEASE_AMBIGUOUS');

    const occupancy = occupancyResult.rows[0] ?? null;
    const lease = leaseResult.rows[0] ?? null;
    if (
      occupancy &&
      lease &&
      (text(lease.occupancy_id) !== text(occupancy.id) ||
        text(lease.resident_id) !== text(occupancy.resident_id))
    ) {
      this.throwAmbiguous('ROOM_ACTIVE_AUTHORITY_MISMATCH');
    }

    const occupancyResidentId = occupancy ? text(occupancy.resident_id) : null;
    const leaseId = lease ? text(lease.id) : null;
    const billingResidentId = occupancyResidentId ?? (lease ? text(lease.resident_id) : null);
    const [billingResult, vehiclesResult, complaintResult, timelineResult] = await Promise.all([
      client.query<Row>(
        `SELECT
             COALESCE(SUM(invoice.total_amount) FILTER (
               WHERE invoice.invoice_status IN ('issued', 'unpaid', 'partially_paid', 'overdue')
             ), 0)::bigint AS open_invoiced_amount,
             COALESCE((
               SELECT SUM(allocation.allocated_amount)
               FROM payment_allocations allocation
               JOIN payments payment
                 ON payment.id = allocation.payment_id
                AND payment.property_id = $1
                AND payment.payment_status = 'verified'
                AND payment.resident_id = $4
               JOIN invoices allocated_invoice
                 ON allocated_invoice.id = allocation.invoice_id
                AND allocated_invoice.property_id = $1
                AND allocated_invoice.room_id = $2
                AND allocated_invoice.lease_id = $3
                AND allocated_invoice.resident_id = $4
               WHERE allocation.target_type = 'invoice'
                 AND allocation.target_id = allocated_invoice.id
                 AND allocation.allocation_status = 'active'
             ), 0)::bigint AS verified_invoice_allocated,
             COALESCE((
               SELECT SUM(allocation.allocated_amount)
               FROM payment_allocations allocation
               JOIN payments payment
                 ON payment.id = allocation.payment_id
                AND payment.property_id = $1
                AND payment.payment_status = 'verified'
                AND payment.resident_id = $4
               JOIN invoices allocated_invoice
                 ON allocated_invoice.id = allocation.invoice_id
                AND allocated_invoice.property_id = $1
                AND allocated_invoice.room_id = $2
                AND allocated_invoice.lease_id = $3
                AND allocated_invoice.resident_id = $4
                AND allocated_invoice.invoice_status IN (
                  'issued', 'unpaid', 'partially_paid', 'overdue'
                )
               WHERE allocation.target_type = 'invoice'
                 AND allocation.target_id = allocated_invoice.id
                 AND allocation.allocation_status = 'active'
             ), 0)::bigint AS open_verified_invoice_allocated,
             (ARRAY_AGG(invoice.due_date ORDER BY invoice.due_date, invoice.snapshot_period_key, invoice.id)
               FILTER (WHERE invoice.invoice_status IN (
                 'issued', 'unpaid', 'partially_paid', 'overdue'
               )))[1] AS next_due_date,
             (ARRAY_AGG(invoice.snapshot_period_key ORDER BY invoice.due_date, invoice.snapshot_period_key, invoice.id)
               FILTER (WHERE invoice.invoice_status IN (
                 'issued', 'unpaid', 'partially_paid', 'overdue'
               )))[1] AS next_due_period,
             COALESCE((
               SELECT SUM(proof.claimed_amount)
               FROM payment_proofs proof
               JOIN invoices proof_invoice
                 ON proof_invoice.id = proof.invoice_id
               AND proof_invoice.property_id = proof.property_id
               WHERE proof.property_id = $1
                 AND proof_invoice.room_id = $2
                 AND proof_invoice.lease_id = $3
                 AND proof_invoice.resident_id = $4
                 AND proof.resident_id = $4
                 AND proof.proof_status = 'pending_review'
             ), 0)::bigint AS awaiting_confirmation_amount
           FROM invoices invoice
           WHERE invoice.property_id = $1
             AND invoice.room_id = $2
             AND $3::uuid IS NOT NULL
             AND invoice.lease_id = $3
             AND invoice.resident_id = $4`,
        [propertyId, roomId, leaseId, billingResidentId],
      ),
      client.query<Row>(
        `SELECT vehicle.vehicle_code, vehicle.plate_number, vehicle.vehicle_type,
                  MIN(slot.slot_status) AS parking_status,
                  COUNT(slot.id)::integer AS parking_assignment_count
           FROM vehicles vehicle
           LEFT JOIN parking_zones zone
             ON zone.property_id = vehicle.property_id
           LEFT JOIN parking_slots slot
             ON slot.zone_id = zone.id
            AND slot.vehicle_id = vehicle.id
           WHERE vehicle.property_id = $1
             AND ($2::uuid IS NOT NULL AND vehicle.resident_id = $2)
             AND vehicle.vehicle_status = 'active'
           GROUP BY vehicle.id, vehicle.vehicle_code, vehicle.plate_number, vehicle.vehicle_type
           ORDER BY vehicle.vehicle_code, vehicle.id
           LIMIT 20`,
        [propertyId, occupancyResidentId],
      ),
      client.query<Row>(
        `SELECT complaint.complaint_code, category.name AS category_name,
                  complaint.complaint_status, complaint.priority,
                  work_order.work_order_code, work_order.work_order_status,
                  technician.display_name AS technician_name
           FROM complaints complaint
           JOIN complaint_categories category
             ON category.id = complaint.category_id
            AND category.property_id = complaint.property_id
           LEFT JOIN maintenance_work_orders work_order
             ON work_order.complaint_id = complaint.id
            AND work_order.property_id = complaint.property_id
            AND work_order.room_id = complaint.room_id
           LEFT JOIN technician_profiles technician
             ON technician.user_id = work_order.assigned_to_user_id
            AND technician.property_id = work_order.property_id
           WHERE complaint.property_id = $1
             AND complaint.room_id = $2
             AND complaint.complaint_status NOT IN ('closed', 'cancelled')
           ORDER BY complaint.submitted_at DESC, complaint.id, work_order.created_at DESC
           LIMIT 20`,
        [propertyId, roomId],
      ),
      client.query<Row>(
        `SELECT event_type, occurred_at
           FROM (
             SELECT 'room_updated'::text AS event_type, audit.occurred_at
             FROM audit_logs audit
             WHERE audit.property_id = $1 AND audit.resource_type = 'room'
               AND audit.resource_id = $2
               AND audit.action IN ('room.update.v2', 'room.status_update.v2')
             UNION ALL
             SELECT 'occupancy_' || history.event_type, history.created_at
             FROM occupancy_history history
             JOIN occupancies occupancy
               ON occupancy.id = history.occupancy_id
              AND occupancy.property_id = $1
             WHERE occupancy.room_id = $2
             UNION ALL
             SELECT 'lease_' || history.event_type, history.created_at
             FROM lease_history history
             JOIN leases lease
               ON lease.id = history.lease_id
              AND lease.property_id = history.property_id
             WHERE history.property_id = $1 AND lease.room_id = $2
             UNION ALL
             SELECT 'hold_created', hold.created_at
             FROM booking_lead_holds hold
             WHERE hold.property_id = $1 AND hold.room_id = $2
             UNION ALL
             SELECT 'hold_released', hold.released_at
             FROM booking_lead_holds hold
             WHERE hold.property_id = $1 AND hold.room_id = $2 AND hold.released_at IS NOT NULL
             UNION ALL
             SELECT 'hold_expired', hold.expires_at
             FROM booking_lead_holds hold
             WHERE hold.property_id = $1 AND hold.room_id = $2 AND hold.hold_status = 'expired'
             UNION ALL
             SELECT 'maintenance_' || history.to_status, history.changed_at
             FROM maintenance_work_order_histories history
             JOIN maintenance_work_orders work_order
               ON work_order.id = history.work_order_id
              AND work_order.property_id = $1
             WHERE work_order.room_id = $2
           ) safe_timeline
           WHERE occurred_at IS NOT NULL
           ORDER BY occurred_at DESC, event_type
           LIMIT 50`,
        [propertyId, roomId],
      ),
    ]);
    if (vehiclesResult.rows.some((vehicle) => Number(vehicle.parking_assignment_count) > 1)) {
      this.throwAmbiguous('ROOM_PARKING_AUTHORITY_AMBIGUOUS');
    }

    const projection = this.project(
      room,
      facilitiesResult.rows,
      occupancy,
      lease,
      billingResult.rows[0] ?? {},
      vehiclesResult.rows,
      complaintResult.rows,
      timelineResult.rows,
    );
    return v2Data(projection);
  }

  private async roomIdentity(
    client: PoolClient,
    propertyId: string,
    roomNumber: string,
  ): Promise<Row> {
    const result = await client.query<Row>(
      `SELECT room.id, room.property_id, room.kost_type_id, room.number, room.room_code,
              room.building_id, room.unit_code, room.gender_policy, room.floor_code,
              room.floor_label, room.size_label, room.room_status, room.public_visible,
              room.primary_photo_file_id, room.import_notes, room.updated_at,
              building.building_code, building.building_name,
              kost_type.category, kost_type.name AS kost_type_name,
              commercial_version.effective_date AS commercial_effective_date,
              commercial_version.monthly_price,
              commercial_version.annual_contract_value AS yearly_price,
              (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
                AS deposit_amount,
              commercial_version.minimum_dp_percent,
              commercial_version.security_deposit_months,
              commercial_version.payment_schedules,
              EXISTS (
                SELECT 1 FROM booking_lead_holds active_hold
                WHERE active_hold.property_id = room.property_id
                  AND active_hold.room_id = room.id
                  AND active_hold.hold_status = 'active'
              ) AS active_hold_exists,
              EXISTS (
                SELECT 1 FROM maintenance_work_orders active_work_order
                WHERE active_work_order.property_id = room.property_id
                  AND active_work_order.room_id = room.id
                  AND active_work_order.work_order_status NOT IN ('verified', 'cancelled')
              ) AS active_maintenance_exists
       FROM rooms room
       JOIN room_buildings building
         ON building.id = room.building_id
        AND building.property_id = room.property_id
        AND building.category = room.category
        AND building.gender_policy = room.gender_policy
       JOIN kost_types kost_type
         ON kost_type.id = room.kost_type_id
        AND kost_type.property_id = room.property_id
        AND kost_type.category = room.category
        AND kost_type.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT DISTINCT ON (version.kost_type_id)
                version.effective_date, version.monthly_price, version.annual_contract_value,
                version.minimum_dp_percent, version.security_deposit_months,
                version.payment_schedules
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= CURRENT_DATE
         ORDER BY version.kost_type_id, version.effective_date DESC, version.id DESC
       ) commercial_version ON true
       WHERE room.property_id = $1
         AND room.number = $2
       ORDER BY room.id`,
      [propertyId, roomNumber],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    }
    if (result.rows.length > 1) this.throwAmbiguous('ROOM_NUMBER_AMBIGUOUS');
    if (!result.rows[0].commercial_effective_date) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED',
        message: 'Room category commercial authority requires reconciliation.',
      });
    }
    return result.rows[0];
  }

  private project(
    room: Row,
    facilities: Row[],
    occupancy: Row | null,
    lease: Row | null,
    billing: Row,
    vehicles: Row[],
    complaints: Row[],
    timeline: Row[],
  ): AdminRoomDetailProjection {
    const annual = money(room.yearly_price);
    const monthly = money(room.monthly_price);
    const minimumDpPercent = Number(room.minimum_dp_percent ?? 25);
    const minimumDp = Math.ceil((annual * minimumDpPercent) / 100);
    const verifiedInvoice = money(billing.verified_invoice_allocated);
    const openInvoiced = money(billing.open_invoiced_amount);
    const openVerifiedInvoice = money(billing.open_verified_invoice_allocated);
    const leaseMinimumDp = lease
      ? Math.ceil((money(lease.snapshot_yearly_price) * minimumDpPercent) / 100)
      : minimumDp;
    const depositRequired = lease
      ? money(lease.snapshot_deposit_amount)
      : money(room.deposit_amount);
    const schedules = Array.isArray(room.payment_schedules)
      ? room.payment_schedules.map(String)
      : ['annual', 'two_month_installments'];
    const paymentPlanDescription =
      schedules.includes('annual') && schedules.includes('two_month_installments')
        ? 'Tahunan penuh atau angsuran per dua bulan'
        : schedules.includes('annual')
          ? 'Tahunan penuh'
          : 'Angsuran per dua bulan';
    const reconciliationRequired = Boolean(Boolean(occupancy) !== Boolean(lease));
    const status = text(room.room_status);
    return {
      id: text(room.id),
      property_id: text(room.property_id),
      number: text(room.number),
      room_code: nullableText(room.room_code),
      building: {
        id: text(room.building_id),
        code: text(room.building_code),
        name: text(room.building_name),
      },
      category: {
        id: text(room.kost_type_id),
        code: text(room.category) as 'rukost' | 'apartkost',
        name: text(room.kost_type_name),
      },
      physical: {
        unit_code: nullableText(room.unit_code),
        floor_code: text(room.floor_code) as 'A' | 'B',
        floor_label: text(room.floor_label),
        size_label: nullableText(room.size_label),
        primary_photo_file_id: nullableText(room.primary_photo_file_id),
        gender_policy: text(room.gender_policy) as 'male' | 'female',
        status,
        public_visible: Boolean(room.public_visible),
        notes: nullableText(room.import_notes),
        structural_edit_locked:
          ['reserved', 'occupied', 'maintenance', 'requires_review'].includes(status) ||
          Boolean(occupancy || lease) ||
          Boolean(room.active_hold_exists) ||
          Boolean(room.active_maintenance_exists) ||
          reconciliationRequired,
      },
      commercial: {
        source: 'current_category',
        monthly_price: monthly,
        annual_contract_value: annual,
        minimum_dp_amount: minimumDp,
        minimum_dp_label: `Minimum ${minimumDpPercent}% dari nilai kontrak tahunan`,
        security_deposit_required: money(room.deposit_amount),
        payment_plan_description: paymentPlanDescription,
        facilities: facilities.map((item) => ({ id: text(item.id), name: text(item.name) })),
      },
      resident: occupancy
        ? {
            display_name: text(occupancy.full_name),
            account_status: text(occupancy.account_status),
            university: null,
            occupancy_start: iso(occupancy.start_date),
          }
        : null,
      lease: lease
        ? {
            id: text(lease.id),
            code: text(lease.lease_code),
            status: text(lease.lease_status),
            start_date: iso(lease.start_date),
            end_date: lease.end_date ? iso(lease.end_date) : null,
            duration_months: leaseDurationMonths(lease.start_date, lease.end_date),
            payment_plan: text(lease.billing_cycle),
            occupancy_start: occupancy ? iso(occupancy.start_date) : null,
            occupancy_end: occupancy?.end_date ? iso(occupancy.end_date) : null,
            occupancy_state: occupancy ? text(occupancy.occupancy_status) : null,
          }
        : null,
      reconciliation: {
        state: reconciliationRequired ? 'lease_reconciliation_required' : 'normal',
        messages:
          occupancy && !lease
            ? ['Hunian aktif belum memiliki penyewaan aktif yang selaras.']
            : lease && !occupancy
              ? ['Penyewaan aktif belum memiliki hunian aktif yang selaras.']
              : [],
      },
      billing: {
        contract_value: lease ? money(lease.snapshot_yearly_price) : null,
        verified_invoice_allocated: verifiedInvoice,
        unpaid_amount: Math.max(0, openInvoiced - openVerifiedInvoice),
        next_due_date: billing.next_due_date ? iso(billing.next_due_date) : null,
        next_due_period: nullableText(billing.next_due_period),
        minimum_dp_amount: leaseMinimumDp,
        dp_verified_amount: null,
        dp_progress_label: 'Belum dapat direkonsiliasi dari klasifikasi pembayaran saat ini',
        security_deposit_required: depositRequired,
        deposit_held: lease ? money(lease.deposit_collected_amount) : 0,
        deposit_refunded: lease ? money(lease.deposit_refunded_amount) : 0,
        deposit_deducted: lease ? money(lease.deposit_deduction_amount) : 0,
        awaiting_confirmation_amount: money(billing.awaiting_confirmation_amount),
      },
      vehicles: vehicles.map((vehicle) => ({
        code: text(vehicle.vehicle_code),
        plate_number: text(vehicle.plate_number),
        vehicle_type: text(vehicle.vehicle_type),
        parking_state: nullableText(vehicle.parking_status),
      })),
      complaints: complaints.map((complaint) => ({
        code: text(complaint.complaint_code),
        category: text(complaint.category_name),
        status: text(complaint.complaint_status),
        priority: text(complaint.priority),
        work_order_code: nullableText(complaint.work_order_code),
        work_order_status: nullableText(complaint.work_order_status),
        technician_name: nullableText(complaint.technician_name),
      })),
      ownership: {
        display_name: 'KOSTATION',
        source: 'policy_default',
        ownership_reconciliation_required: true,
      },
      timeline: timeline.flatMap((item) => {
        const eventType = text(item.event_type);
        const label = TIMELINE_LABELS[eventType];
        return label ? [{ event_type: eventType, label, occurred_at: iso(item.occurred_at) }] : [];
      }),
      links: {
        resident: null,
        lease: lease ? `/penyewaan/${encodeURIComponent(text(lease.id))}` : null,
        billing: null,
        vehicles: null,
        complaints: null,
      },
      updated_at: iso(room.updated_at),
    };
  }

  private normalizeRoomNumber(value: string): string {
    const normalized = value.trim();
    const containsControlCharacter = Array.from(normalized).some(
      (character) => character.charCodeAt(0) < 32,
    );
    if (!normalized || normalized.length > 80 || containsControlCharacter) {
      throw new BadRequestException({
        code: 'ROOM_NUMBER_INVALID',
        message: 'Room number must contain 1 to 80 visible characters.',
      });
    }
    return normalized;
  }

  private assertAdminRole(user: UserAccessContext): void {
    if (!user.roles.some((role) => ['owner', 'manager', 'admin'].includes(role))) {
      throw new ForbiddenException({
        code: 'ROOM_DETAIL_FORBIDDEN',
        message: 'Full room detail is limited to authorized Admin operators.',
      });
    }
  }

  private throwAmbiguous(code: string): never {
    throw new ConflictException({
      code,
      message: 'Room detail contains ambiguous active authority and requires reconciliation.',
    });
  }
}
