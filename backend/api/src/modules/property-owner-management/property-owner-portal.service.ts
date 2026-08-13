import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, rgb } from 'pdf-lib';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';

type OwnerRow = { id: string; property_id: string; full_name: string };
type AssignmentRow = {
  assignment_key: string;
  effective_from: string;
  effective_until: string | null;
  scope_from: string;
  scope_until: string;
};
type ReportPeriod = { period: string; start: string; end: string; until: string };
type SafeReport = ReturnType<PropertyOwnerPortalService['emptyReport']>;
type SafeRow = Record<string, string | null>;

const roomStatuses = [
  'vacant',
  'reserved',
  'occupied',
  'maintenance',
  'inactive',
  'requires_review',
] as const;
const leaseStatuses = [
  'draft',
  'awaiting_activation',
  'active',
  'ended',
  'completed',
  'cancelled',
  'transferred',
] as const;
const reportLeaseStatuses = ['active', 'ended', 'completed', 'transferred'] as const;
const occupancyStatuses = ['active', 'ended', 'transferred'] as const;
const earningStatuses = ['recognized', 'reversed'] as const;
const adjustmentKinds = ['reversal', 'refund', 'transfer_proration', 'clawback'] as const;
const settlementStatuses = ['draft', 'ready_for_review', 'approved', 'paid', 'void'] as const;
const payoutKinds = ['payout', 'reversal'] as const;
const complaintStatuses = [
  'submitted',
  'acknowledged',
  'in_progress',
  'on_hold',
  'escalated',
  'resolved',
  'reopened',
  'closed',
  'cancelled',
] as const;
const workOrderStatuses = [
  'open',
  'assigned',
  'in_progress',
  'on_hold',
  'completed',
  'rework_required',
  'verified',
  'cancelled',
] as const;
const issuePriorities = ['low', 'medium', 'high', 'urgent'] as const;
const notificationStatuses = ['unread', 'read', 'archived'] as const;
const notificationPriorities = ['urgent', 'high', 'normal', 'low'] as const;

@Injectable()
export class PropertyOwnerPortalService {
  constructor(private readonly database: DatabaseService) {}

  async getPortal(actor: UserAccessContext) {
    const owner = await this.resolveOwner(actor);
    if (!owner) return this.emptyPortal();

    const summary = await this.database.client.query(
      `WITH current_scope AS (
         SELECT rooms.id AS room_id, rooms.building_id, assignments.effective_from AS scope_from, assignments.effective_until AS scope_until
         FROM building_owner_assignments assignments
         JOIN rooms ON rooms.building_id = assignments.building_id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
           AND (assignments.effective_until IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         UNION ALL
         SELECT rooms.id, rooms.building_id, assignments.effective_from, assignments.effective_until
         FROM room_owner_assignments assignments
         JOIN rooms ON rooms.id = assignments.room_id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
           AND (assignments.effective_until IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
       ), assignment_state AS (
         SELECT
           COUNT(*) FILTER (WHERE effective_from > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)::int AS scheduled_count,
           MIN(effective_from) FILTER (WHERE effective_from > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)::text AS next_scheduled_date,
           COUNT(*) FILTER (WHERE effective_until IS NOT NULL AND effective_until <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)::int AS expired_count,
           to_char(MAX(effective_until - INTERVAL '1 day') FILTER (WHERE effective_until IS NOT NULL AND effective_until <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date), 'YYYY-MM') AS latest_historical_period
         FROM (
           SELECT effective_from, effective_until FROM building_owner_assignments WHERE owner_profile_id = $1 AND property_id = $2
           UNION ALL
           SELECT effective_from, effective_until FROM room_owner_assignments WHERE owner_profile_id = $1 AND property_id = $2
         ) assignments
        ), current_authorized_earnings AS (
          SELECT DISTINCT earnings.id, earnings.room_id
          FROM property_owner_earnings earnings
          JOIN current_scope scope ON scope.room_id = earnings.room_id
          WHERE earnings.owner_profile_id = $1 AND earnings.property_id = $2
            AND earnings.earning_status = 'recognized'
            AND earnings.service_from IS NOT NULL AND earnings.service_until IS NOT NULL
            AND earnings.service_from >= scope.scope_from
            AND (scope.scope_until IS NULL OR earnings.service_until <= scope.scope_until)
        ), current_settlement_authority AS (
          SELECT settlements.id, COUNT(lines.earning_id)::int AS total_line_count,
                 COUNT(current_authorized_earnings.id)::int AS authorized_line_count
          FROM property_owner_settlements settlements
          LEFT JOIN property_owner_settlement_lines lines ON lines.settlement_id = settlements.id
          LEFT JOIN current_authorized_earnings ON current_authorized_earnings.id = lines.earning_id
          WHERE settlements.owner_profile_id = $1 AND settlements.property_id = $2
          GROUP BY settlements.id
        ), current_authorized_settlements AS (
          SELECT id FROM current_settlement_authority
          WHERE total_line_count > 0 AND total_line_count = authorized_line_count
        ), current_authorized_adjustments AS (
          SELECT adjustments.id, earnings.room_id
          FROM property_owner_earning_adjustments adjustments
          JOIN current_authorized_earnings earnings ON earnings.id = adjustments.earning_id
          JOIN current_authorized_settlements settlements ON settlements.id = adjustments.settlement_id
          WHERE adjustments.owner_profile_id = $1 AND adjustments.property_id = $2
        ), current_authorized_payouts AS (
          SELECT payouts.id, earnings.room_id
          FROM property_owner_payouts payouts
          JOIN current_authorized_settlements settlements ON settlements.id = payouts.settlement_id
          JOIN property_owner_settlement_lines lines ON lines.settlement_id = payouts.settlement_id
          JOIN current_authorized_earnings earnings ON earnings.id = lines.earning_id
          WHERE payouts.owner_profile_id = $1 AND payouts.property_id = $2
        ), notification_resources AS (
         SELECT notifications.id AS notification_id, complaints.room_id
         FROM notifications JOIN complaints ON complaints.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'complaint.%' AND complaints.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, work_orders.room_id
         FROM notifications JOIN maintenance_work_orders work_orders ON work_orders.id = notifications.source_resource_id
         WHERE (notifications.source_event_type LIKE 'work_order.%' OR notifications.source_event_type LIKE 'maintenance.%') AND work_orders.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, occupancies.room_id
         FROM notifications JOIN occupancies ON occupancies.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'occupancy.%' AND occupancies.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, leases.room_id
         FROM notifications JOIN leases ON leases.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'lease.%' AND leases.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, invoices.room_id
         FROM notifications JOIN invoices ON invoices.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'billing.%' AND invoices.property_id = notifications.property_id
         UNION ALL
          SELECT notifications.id, earnings.room_id
          FROM notifications JOIN current_authorized_earnings earnings ON earnings.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.earning.%'
         UNION ALL
         SELECT notifications.id, earnings.room_id
         FROM notifications
          JOIN current_authorized_settlements settlements ON settlements.id = notifications.source_resource_id
          JOIN property_owner_settlement_lines lines ON lines.settlement_id = settlements.id
          JOIN current_authorized_earnings earnings ON earnings.id = lines.earning_id
          WHERE notifications.source_event_type LIKE 'property_owner.settlement.%'
         UNION ALL
          SELECT notifications.id, payouts.room_id
          FROM notifications
          JOIN current_authorized_payouts payouts ON payouts.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.payout.%'
         UNION ALL
          SELECT notifications.id, adjustments.room_id
          FROM notifications
          JOIN current_authorized_adjustments adjustments ON adjustments.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.adjustment.%'
       )
       SELECT
         COUNT(DISTINCT scope.building_id)::int AS building_count,
         COUNT(DISTINCT scope.room_id)::int AS room_count,
         COUNT(DISTINCT scope.room_id) FILTER (WHERE rooms.room_status = 'occupied')::int AS occupied_count,
         COUNT(DISTINCT scope.room_id) FILTER (WHERE rooms.room_status = 'reserved')::int AS reserved_count,
         COUNT(DISTINCT scope.room_id) FILTER (WHERE rooms.room_status IN ('maintenance', 'requires_review'))::int AS maintenance_count,
         COUNT(DISTINCT scope.room_id) FILTER (WHERE rooms.room_status = 'vacant')::int AS vacant_count,
         (SELECT COUNT(DISTINCT complaints.id)::int FROM complaints JOIN current_scope authorized_scope ON authorized_scope.room_id = complaints.room_id
           WHERE complaints.property_id = $2 AND complaints.complaint_status NOT IN ('resolved', 'closed', 'cancelled')
             AND complaints.created_at >= authorized_scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
             AND (authorized_scope.scope_until IS NULL OR complaints.created_at < authorized_scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta')) AS open_complaints,
         (SELECT COUNT(DISTINCT work_orders.id)::int FROM maintenance_work_orders work_orders JOIN current_scope authorized_scope ON authorized_scope.room_id = work_orders.room_id
           WHERE work_orders.property_id = $2 AND work_orders.work_order_status NOT IN ('verified', 'cancelled')
             AND work_orders.created_at >= authorized_scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
             AND (authorized_scope.scope_until IS NULL OR work_orders.created_at < authorized_scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta')) AS open_maintenance,
         (SELECT COUNT(DISTINCT notifications.id)::int FROM notifications
           JOIN notification_resources resources ON resources.notification_id = notifications.id
           JOIN current_scope authorized_scope ON authorized_scope.room_id = resources.room_id
           WHERE notifications.property_id = $2 AND notifications.recipient_user_id = $3 AND notifications.notification_status = 'unread'
             AND notifications.created_at >= authorized_scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
             AND (authorized_scope.scope_until IS NULL OR notifications.created_at < authorized_scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta')) AS unread_notifications,
         assignment_state.*
       FROM current_scope scope
       JOIN rooms ON rooms.id = scope.room_id
       CROSS JOIN assignment_state`,
      [owner.id, owner.property_id, actor.id],
    );
    const row = this.singleRow(summary.rows, 'portal.summary');
    const assets = await this.database.client.query(
      `WITH current_scope AS (
         SELECT rooms.id AS room_id, assignments.effective_from AS scope_from, assignments.effective_until AS scope_until
         FROM building_owner_assignments assignments
         JOIN rooms ON rooms.building_id = assignments.building_id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
           AND (assignments.effective_until IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         UNION ALL
         SELECT room_id, effective_from, effective_until FROM room_owner_assignments assignments
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
           AND (assignments.effective_until IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
       )
       SELECT rooms.room_code, rooms.room_status, buildings.building_code, buildings.building_name,
              leases.lease_status, leases.end_date::text AS lease_end_date
       FROM current_scope scope
       JOIN rooms ON rooms.id = scope.room_id
       LEFT JOIN room_buildings buildings ON buildings.id = rooms.building_id
       LEFT JOIN leases ON leases.room_id = rooms.id AND leases.lease_status = 'active'
         AND leases.start_date < COALESCE(scope.scope_until, 'infinity'::date)
         AND COALESCE(leases.end_date + 1, 'infinity'::date) > scope.scope_from
       ORDER BY buildings.building_code, rooms.room_code`,
      [owner.id, owner.property_id],
    );
    const currentRoomCount = this.count(row.room_count, 'scope.room_count');
    const scheduledCount = this.count(row.scheduled_count, 'scope.scheduled_count');
    const expiredCount = this.count(row.expired_count, 'scope.expired_count');
    return {
      owner: { display_name: this.text(owner.full_name, 'owner.full_name') },
      scope: {
        state:
          currentRoomCount > 0
            ? 'active'
            : scheduledCount > 0
              ? 'scheduled'
              : expiredCount > 0
                ? 'historical'
                : 'empty',
        building_count: this.count(row.building_count, 'scope.building_count'),
        room_count: currentRoomCount,
        scheduled_count: scheduledCount,
        next_scheduled_date: this.nullableDate(
          row.next_scheduled_date,
          'scope.next_scheduled_date',
        ),
        expired_count: expiredCount,
        latest_historical_period: this.nullablePeriod(
          row.latest_historical_period,
          'scope.latest_historical_period',
        ),
      },
      occupancy: {
        occupied_count: this.count(row.occupied_count, 'occupancy.occupied_count'),
        reserved_count: this.count(row.reserved_count, 'occupancy.reserved_count'),
        maintenance_count: this.count(row.maintenance_count, 'occupancy.maintenance_count'),
        vacant_count: this.count(row.vacant_count, 'occupancy.vacant_count'),
      },
      issues: {
        open_complaints: this.count(row.open_complaints, 'issues.open_complaints'),
        open_maintenance: this.count(row.open_maintenance, 'issues.open_maintenance'),
        unread_notifications: this.count(row.unread_notifications, 'issues.unread_notifications'),
      },
      assets: assets.rows.map((asset, index) => ({
        room_code: this.text(asset.room_code, `assets.${index}.room_code`),
        room_status: this.enumValue(asset.room_status, roomStatuses, `assets.${index}.room_status`),
        building_code: this.nullableText(asset.building_code, `assets.${index}.building_code`),
        building_name: this.nullableText(asset.building_name, `assets.${index}.building_name`),
        lease_status:
          asset.lease_status === null
            ? null
            : this.enumValue(asset.lease_status, leaseStatuses, `assets.${index}.lease_status`),
        lease_end_date: this.nullableDate(asset.lease_end_date, `assets.${index}.lease_end_date`),
      })),
    };
  }

  async preview(actor: UserAccessContext, periodInput: string) {
    const period = this.parsePeriod(periodInput);
    const owner = await this.resolveOwner(actor);
    if (!owner) return this.emptyReport(period);
    return this.buildReport(owner, actor.id, period);
  }

  async export(actor: UserAccessContext, periodInput: string, formatInput: string) {
    if (!['pdf', 'xlsx'].includes(formatInput)) {
      throw new BadRequestException({
        code: 'REPORT_EXPORT_FORMAT_INVALID',
        message: 'Export format must be pdf or xlsx',
      });
    }
    const report = await this.preview(actor, periodInput);
    return {
      content: formatInput === 'pdf' ? await this.toPdf(report) : this.toXlsx(report),
      contentType:
        formatInput === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `owner-report-${report.period.period}.${formatInput}`,
      checksum: report.scope_checksum,
      watermark: report.watermark,
    };
  }

  private async buildReport(owner: OwnerRow, actorId: string, period: ReportPeriod) {
    const assignments = await this.database.client.query<AssignmentRow>(
      `SELECT assignment_key, effective_from::text, effective_until::text,
              GREATEST(effective_from, $3::date)::text AS scope_from,
              LEAST(COALESCE(effective_until, $4::date), $4::date)::text AS scope_until
       FROM (
         SELECT 'building:' || id::text AS assignment_key, effective_from, effective_until
         FROM building_owner_assignments
         WHERE owner_profile_id = $1 AND property_id = $2 AND effective_from < $4::date AND (effective_until IS NULL OR effective_until > $3::date)
         UNION ALL
         SELECT 'room:' || id::text AS assignment_key, effective_from, effective_until
         FROM room_owner_assignments
         WHERE owner_profile_id = $1 AND property_id = $2 AND effective_from < $4::date AND (effective_until IS NULL OR effective_until > $3::date)
       ) assignments ORDER BY assignment_key`,
      [owner.id, owner.property_id, period.start, period.until],
    );
    if (assignments.rows.length === 0) {
      throw new ForbiddenException({
        code: 'OWNER_REPORT_PERIOD_DENIED',
        message: 'The selected reporting period is unavailable',
      });
    }
    const normalizedAssignments = assignments.rows.map((assignment, index) => ({
      assignment_key: this.text(assignment.assignment_key, `assignments.${index}.assignment_key`),
      effective_from: this.date(assignment.effective_from, `assignments.${index}.effective_from`),
      effective_until: this.nullableDate(
        assignment.effective_until,
        `assignments.${index}.effective_until`,
      ),
      scope_from: this.date(assignment.scope_from, `assignments.${index}.scope_from`),
      scope_until: this.date(assignment.scope_until, `assignments.${index}.scope_until`),
    }));
    const scopeChecksum = createHash('sha256')
      .update(
        JSON.stringify({
          owner: owner.id,
          property: owner.property_id,
          period: this.publicPeriod(period),
          assignments: normalizedAssignments,
        }),
      )
      .digest('hex');
    const result = await this.database.client.query(
      `WITH raw_period_scope AS (
         SELECT rooms.id AS room_id,
                GREATEST(assignments.effective_from, $3::date) AS scope_from,
                LEAST(COALESCE(assignments.effective_until, $4::date), $4::date) AS scope_until
         FROM building_owner_assignments assignments
         JOIN rooms ON rooms.building_id = assignments.building_id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from < $4::date AND (assignments.effective_until IS NULL OR assignments.effective_until > $3::date)
         UNION ALL
         SELECT assignments.room_id,
                GREATEST(assignments.effective_from, $3::date),
                LEAST(COALESCE(assignments.effective_until, $4::date), $4::date)
         FROM room_owner_assignments assignments
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND assignments.effective_from < $4::date AND (assignments.effective_until IS NULL OR assignments.effective_until > $3::date)
       ), period_scope AS (
         SELECT DISTINCT room_id, scope_from, scope_until FROM raw_period_scope WHERE scope_from < scope_until
        ), authorized_lifecycle AS (
          SELECT DISTINCT leases.id AS lease_id, occupancies.id AS occupancy_id, leases.room_id,
                 GREATEST(leases.start_date, occupancies.start_date, scope.scope_from) AS service_from,
                 LEAST(COALESCE(leases.end_date + 1, 'infinity'::date), COALESCE(occupancies.end_date + 1, 'infinity'::date), scope.scope_until) AS service_until,
                 leases.lease_status, occupancies.occupancy_status
          FROM period_scope scope
          JOIN leases ON leases.room_id = scope.room_id AND leases.property_id = $2
          JOIN occupancies ON occupancies.id = leases.occupancy_id AND occupancies.property_id = $2 AND occupancies.room_id = scope.room_id
          WHERE leases.lease_status IN ('active', 'ended', 'completed', 'transferred')
            AND occupancies.occupancy_status IN ('active', 'ended', 'transferred')
            AND GREATEST(leases.start_date, occupancies.start_date, scope.scope_from)
              < LEAST(COALESCE(leases.end_date + 1, 'infinity'::date), COALESCE(occupancies.end_date + 1, 'infinity'::date), scope.scope_until)
        ), authorized_occupancies AS (
          SELECT occupancy_id AS id, room_id, service_from AS start_date, (service_until - 1) AS end_date, occupancy_status
          FROM authorized_lifecycle
        ), authorized_leases AS (
          SELECT lease_id AS id, room_id, service_from AS start_date, (service_until - 1) AS end_date, lease_status
          FROM authorized_lifecycle
       ), authorized_earnings AS (
          SELECT DISTINCT earnings.id, earnings.room_id, earnings.earning_month, earnings.service_from, earnings.service_until,
                 earnings.gross_collected_amount, earnings.owner_earned_amount, earnings.operator_fee_amount, earnings.earning_status
          FROM property_owner_earnings earnings
          JOIN period_scope scope ON scope.room_id = earnings.room_id
            AND scope.scope_from <= earnings.service_from AND earnings.service_until <= scope.scope_until
          WHERE earnings.owner_profile_id = $1 AND earnings.property_id = $2
            AND earnings.service_from IS NOT NULL AND earnings.service_until IS NOT NULL
            AND earnings.service_from >= $3::date AND earnings.service_until <= $4::date
            AND ((earnings.ownership_kind = 'building' AND EXISTS (
              SELECT 1 FROM building_owner_assignments assignments WHERE assignments.id = earnings.ownership_assignment_id
                AND assignments.owner_profile_id = $1 AND assignments.property_id = $2
                AND assignments.effective_from <= earnings.service_from AND earnings.service_until <= COALESCE(assignments.effective_until, 'infinity'::date)
            )) OR (earnings.ownership_kind = 'room' AND EXISTS (
              SELECT 1 FROM room_owner_assignments assignments WHERE assignments.id = earnings.ownership_assignment_id
                AND assignments.owner_profile_id = $1 AND assignments.property_id = $2
                AND assignments.effective_from <= earnings.service_from AND earnings.service_until <= COALESCE(assignments.effective_until, 'infinity'::date)
            )))
       ), settlement_authority AS (
         SELECT settlements.id, settlements.period_start, settlements.period_end, settlements.settlement_status,
                settlements.gross_amount, settlements.owner_amount, settlements.operator_fee_amount,
                COUNT(lines.earning_id)::int AS total_line_count, COUNT(authorized_earnings.id)::int AS authorized_line_count
         FROM property_owner_settlements settlements
         LEFT JOIN property_owner_settlement_lines lines ON lines.settlement_id = settlements.id
         LEFT JOIN authorized_earnings ON authorized_earnings.id = lines.earning_id
         WHERE settlements.owner_profile_id = $1 AND settlements.property_id = $2
           AND settlements.period_start < $4::date AND settlements.period_end >= $3::date
         GROUP BY settlements.id
       ), authorized_settlements AS (
         SELECT * FROM settlement_authority WHERE total_line_count > 0 AND total_line_count = authorized_line_count
       ), authorized_adjustments AS (
          SELECT adjustments.id, adjustments.earning_id, adjustments.settlement_id, authorized_earnings.room_id, adjustments.effective_month,
                adjustments.adjustment_kind, adjustments.gross_amount_delta, adjustments.owner_amount_delta,
                adjustments.operator_fee_amount_delta
         FROM property_owner_earning_adjustments adjustments
         JOIN authorized_earnings ON authorized_earnings.id = adjustments.earning_id
         JOIN authorized_settlements ON authorized_settlements.id = adjustments.settlement_id
         WHERE adjustments.owner_profile_id = $1 AND adjustments.property_id = $2
           AND adjustments.effective_month >= $3::date AND adjustments.effective_month < $4::date
        ), authorized_payouts AS (
          SELECT payouts.id, payouts.settlement_id, payouts.recorded_at, payouts.payout_kind, payouts.payout_amount
          FROM property_owner_payouts payouts
          JOIN authorized_settlements ON authorized_settlements.id = payouts.settlement_id
          WHERE payouts.owner_profile_id = $1 AND payouts.property_id = $2
            AND payouts.recorded_at >= $3::date AND payouts.recorded_at < $4::date
        ), authorized_payout_resources AS (
          SELECT DISTINCT payouts.id, authorized_earnings.room_id
          FROM authorized_payouts payouts
          JOIN property_owner_settlement_lines lines ON lines.settlement_id = payouts.settlement_id
          JOIN authorized_earnings ON authorized_earnings.id = lines.earning_id
       ), authorized_complaints AS (
         SELECT DISTINCT complaints.id, complaints.complaint_code, complaints.complaint_status, complaints.priority, complaints.created_at
         FROM complaints JOIN period_scope scope ON scope.room_id = complaints.room_id
         WHERE complaints.property_id = $2
           AND complaints.created_at >= scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
           AND complaints.created_at < scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta'
       ), authorized_maintenance AS (
         SELECT DISTINCT work_orders.id, work_orders.work_order_code, work_orders.work_order_status, work_orders.priority, work_orders.created_at
         FROM maintenance_work_orders work_orders JOIN period_scope scope ON scope.room_id = work_orders.room_id
         WHERE work_orders.property_id = $2
           AND work_orders.created_at >= scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
           AND work_orders.created_at < scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta'
        ), notification_resources AS (
         SELECT notifications.id AS notification_id, complaints.room_id
         FROM notifications JOIN complaints ON complaints.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'complaint.%' AND complaints.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, work_orders.room_id
         FROM notifications JOIN maintenance_work_orders work_orders ON work_orders.id = notifications.source_resource_id
         WHERE (notifications.source_event_type LIKE 'work_order.%' OR notifications.source_event_type LIKE 'maintenance.%') AND work_orders.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, occupancies.room_id
         FROM notifications JOIN occupancies ON occupancies.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'occupancy.%' AND occupancies.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, leases.room_id
         FROM notifications JOIN leases ON leases.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'lease.%' AND leases.property_id = notifications.property_id
         UNION ALL
         SELECT notifications.id, invoices.room_id
         FROM notifications JOIN invoices ON invoices.id = notifications.source_resource_id
         WHERE notifications.source_event_type LIKE 'billing.%' AND invoices.property_id = notifications.property_id
         UNION ALL
          SELECT notifications.id, earnings.room_id
          FROM notifications JOIN authorized_earnings earnings ON earnings.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.earning.%'
         UNION ALL
         SELECT notifications.id, earnings.room_id
         FROM notifications
          JOIN authorized_settlements settlements ON settlements.id = notifications.source_resource_id
          JOIN property_owner_settlement_lines lines ON lines.settlement_id = settlements.id
          JOIN authorized_earnings earnings ON earnings.id = lines.earning_id
          WHERE notifications.source_event_type LIKE 'property_owner.settlement.%'
         UNION ALL
          SELECT notifications.id, payouts.room_id
          FROM notifications
          JOIN authorized_payout_resources payouts ON payouts.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.payout.%'
         UNION ALL
          SELECT notifications.id, adjustments.room_id
          FROM notifications
          JOIN authorized_adjustments adjustments ON adjustments.id = notifications.source_resource_id
          WHERE notifications.source_event_type LIKE 'property_owner.adjustment.%'
       ), authorized_notifications AS (
         SELECT DISTINCT notifications.id, notifications.notification_type, notifications.notification_status,
                notifications.priority, notifications.title, notifications.source_event_type,
                notifications.source_resource_id, notifications.created_at
         FROM notifications
         JOIN notification_resources resources ON resources.notification_id = notifications.id
         JOIN period_scope scope ON scope.room_id = resources.room_id
         WHERE notifications.property_id = $2 AND notifications.recipient_user_id = $5
           AND notifications.created_at >= scope.scope_from::timestamp AT TIME ZONE 'Asia/Jakarta'
           AND notifications.created_at < scope.scope_until::timestamp AT TIME ZONE 'Asia/Jakarta'
       )
       SELECT
         COALESCE((SELECT COUNT(DISTINCT room_id) FROM period_scope), 0)::int AS asset_count,
         COALESCE((SELECT COUNT(DISTINCT room_id) FROM authorized_occupancies), 0)::int AS occupied_count,
         COALESCE((SELECT COUNT(DISTINCT room_id) FROM authorized_leases), 0)::int AS active_lease_count,
         COALESCE((SELECT SUM(gross_collected_amount) FILTER (WHERE earning_status = 'recognized') FROM authorized_earnings), 0)::bigint::text AS gross_earned_rent,
         COALESCE((SELECT SUM(owner_earned_amount) FILTER (WHERE earning_status = 'recognized') FROM authorized_earnings), 0)::bigint::text AS owner_entitlement,
         COALESCE((SELECT SUM(operator_fee_amount) FILTER (WHERE earning_status = 'recognized') FROM authorized_earnings), 0)::bigint::text AS management_fee,
         COALESCE((SELECT SUM(owner_amount_delta) FROM authorized_adjustments), 0)::bigint::text AS owner_adjustments,
         COALESCE((SELECT SUM(CASE WHEN payout_kind = 'payout' THEN payout_amount ELSE -payout_amount END) FROM authorized_payouts), 0)::bigint::text AS paid_out,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.room_code, item.scope_from) FROM (
           SELECT rooms.id::text AS room_id, rooms.room_code, scope.scope_from::text, scope.scope_until::text
           FROM period_scope scope JOIN rooms ON rooms.id = scope.room_id
         ) item), '[]'::json) AS scope,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.start_date, item.occupancy_id) FROM (
           SELECT occupancies.id::text AS occupancy_id, rooms.room_code, occupancies.start_date::text,
                  occupancies.end_date::text, occupancies.occupancy_status
           FROM authorized_occupancies occupancies JOIN rooms ON rooms.id = occupancies.room_id
         ) item), '[]'::json) AS occupancies,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.start_date, item.lease_id) FROM (
           SELECT leases.id::text AS lease_id, rooms.room_code, leases.start_date::text,
                  leases.end_date::text, leases.lease_status
           FROM authorized_leases leases JOIN rooms ON rooms.id = leases.room_id
         ) item), '[]'::json) AS leases,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.earning_month, item.earning_id) FROM (
            SELECT earnings.id::text AS earning_id, rooms.room_code, earnings.earning_month::text,
                   earnings.service_from::text, earnings.service_until::text, earnings.earning_status,
                  earnings.gross_collected_amount::text AS gross_earned_rent, earnings.owner_earned_amount::text AS owner_entitlement,
                  earnings.operator_fee_amount::text AS management_fee
           FROM authorized_earnings earnings JOIN rooms ON rooms.id = earnings.room_id
         ) item), '[]'::json) AS earnings,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.effective_month, item.adjustment_id) FROM (
           SELECT id::text AS adjustment_id, earning_id::text, settlement_id::text, effective_month::text, adjustment_kind,
                  gross_amount_delta::text, owner_amount_delta::text, operator_fee_amount_delta::text FROM authorized_adjustments
         ) item), '[]'::json) AS adjustments,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.period_end, item.settlement_id) FROM (
           SELECT id::text AS settlement_id, period_start::text, period_end::text, settlement_status,
                  gross_amount::text, owner_amount::text, operator_fee_amount::text FROM authorized_settlements
         ) item), '[]'::json) AS settlements,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.recorded_at, item.payout_id) FROM (
           SELECT id::text AS payout_id, settlement_id::text, recorded_at::text, payout_kind, payout_amount::text FROM authorized_payouts
         ) item), '[]'::json) AS payouts,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.created_at, item.complaint_id) FROM (
           SELECT id::text AS complaint_id, complaint_code, complaint_status, priority, created_at::text FROM authorized_complaints
         ) item), '[]'::json) AS complaints,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.created_at, item.work_order_id) FROM (
           SELECT id::text AS work_order_id, work_order_code, work_order_status, priority, created_at::text FROM authorized_maintenance
         ) item), '[]'::json) AS maintenance,
         COALESCE((SELECT json_agg(row_to_json(item) ORDER BY item.created_at, item.notification_id) FROM (
           SELECT id::text AS notification_id, notification_type, notification_status, priority, title,
                  source_event_type, source_resource_id::text, created_at::text FROM authorized_notifications
         ) item), '[]'::json) AS notifications`,
      [owner.id, owner.property_id, period.start, period.until, actorId],
    );
    const row = this.singleRow(result.rows, 'report');
    const publicPeriod = this.publicPeriod(period);
    return {
      period: publicPeriod,
      scope_checksum: scopeChecksum,
      watermark: `Owner ${this.text(owner.full_name, 'owner.full_name')} | ${period.period} | scope ${scopeChecksum.slice(0, 12)}`,
      summary: {
        asset_count: this.count(row.asset_count, 'summary.asset_count'),
        occupied_count: this.count(row.occupied_count, 'summary.occupied_count'),
        active_lease_count: this.count(row.active_lease_count, 'summary.active_lease_count'),
        gross_earned_rent: this.money(row.gross_earned_rent, 'summary.gross_earned_rent'),
        owner_entitlement: this.money(row.owner_entitlement, 'summary.owner_entitlement'),
        management_fee: this.money(row.management_fee, 'summary.management_fee'),
        owner_adjustments: this.signedMoney(row.owner_adjustments, 'summary.owner_adjustments'),
        paid_out: this.signedMoney(row.paid_out, 'summary.paid_out'),
      },
      scope: this.rows(row.scope, 'scope', {
        room_id: 'text',
        room_code: 'text',
        scope_from: 'date',
        scope_until: 'date',
      }),
      occupancies: this.rows(row.occupancies, 'occupancies', {
        occupancy_id: 'text',
        room_code: 'text',
        start_date: 'date',
        end_date: 'nullableDate',
        occupancy_status: occupancyStatuses,
      }),
      leases: this.rows(row.leases, 'leases', {
        lease_id: 'text',
        room_code: 'text',
        start_date: 'date',
        end_date: 'nullableDate',
        lease_status: reportLeaseStatuses,
      }),
      earnings: this.rows(row.earnings, 'earnings', {
        earning_id: 'text',
        room_code: 'text',
        earning_month: 'date',
        service_from: 'date',
        service_until: 'date',
        earning_status: earningStatuses,
        gross_earned_rent: 'money',
        owner_entitlement: 'money',
        management_fee: 'money',
      }),
      adjustments: this.rows(row.adjustments, 'adjustments', {
        adjustment_id: 'text',
        earning_id: 'text',
        settlement_id: 'text',
        effective_month: 'date',
        adjustment_kind: adjustmentKinds,
        gross_amount_delta: 'signedMoney',
        owner_amount_delta: 'signedMoney',
        operator_fee_amount_delta: 'signedMoney',
      }),
      settlements: this.rows(row.settlements, 'settlements', {
        settlement_id: 'text',
        period_start: 'date',
        period_end: 'date',
        settlement_status: settlementStatuses,
        gross_amount: 'money',
        owner_amount: 'money',
        operator_fee_amount: 'money',
      }),
      payouts: this.rows(row.payouts, 'payouts', {
        payout_id: 'text',
        settlement_id: 'text',
        recorded_at: 'timestamp',
        payout_kind: payoutKinds,
        payout_amount: 'money',
      }),
      complaints: this.rows(row.complaints, 'complaints', {
        complaint_id: 'text',
        complaint_code: 'text',
        complaint_status: complaintStatuses,
        priority: issuePriorities,
        created_at: 'timestamp',
      }),
      maintenance: this.rows(row.maintenance, 'maintenance', {
        work_order_id: 'text',
        work_order_code: 'text',
        work_order_status: workOrderStatuses,
        priority: issuePriorities,
        created_at: 'timestamp',
      }),
      notifications: this.rows(row.notifications, 'notifications', {
        notification_id: 'text',
        notification_type: 'text',
        notification_status: notificationStatuses,
        priority: notificationPriorities,
        title: 'text',
        source_event_type: 'text',
        source_resource_id: 'text',
        created_at: 'timestamp',
      }),
    };
  }

  private async resolveOwner(actor: UserAccessContext): Promise<OwnerRow | null> {
    const result = await this.database.client.query<OwnerRow>(
      `SELECT profiles.id, profiles.property_id, profiles.full_name FROM property_owner_profiles profiles
       JOIN users ON users.id = profiles.user_id WHERE profiles.user_id = $1 AND profiles.profile_status = 'active' AND users.user_status = 'active' ORDER BY profiles.id`,
      [actor.id],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1)
      throw new ConflictException({
        code: 'PROPERTY_OWNER_PROFILE_AMBIGUOUS',
        message: 'Authenticated owner profile is ambiguous',
      });
    return result.rows[0];
  }

  private parsePeriod(value: string): ReportPeriod {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new BadRequestException({
        code: 'REPORT_PERIOD_INVALID',
        message: 'Reporting period must use YYYY-MM',
      });
    const [year, month] = value.split('-').map(Number);
    const start = `${value}-01`;
    const until = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { period: value, start, end, until };
  }

  private publicPeriod(period: ReportPeriod) {
    return { period: period.period, start: period.start, end: period.end };
  }

  private emptyPortal() {
    return {
      owner: null,
      scope: {
        state: 'empty',
        building_count: 0,
        room_count: 0,
        scheduled_count: 0,
        next_scheduled_date: null,
        expired_count: 0,
        latest_historical_period: null,
      },
      occupancy: { occupied_count: 0, reserved_count: 0, maintenance_count: 0, vacant_count: 0 },
      issues: { open_complaints: 0, open_maintenance: 0, unread_notifications: 0 },
      assets: [],
    };
  }

  private emptyReport(period: ReportPeriod) {
    return {
      period: this.publicPeriod(period),
      scope_checksum: createHash('sha256').update(`empty:${period.period}`).digest('hex'),
      watermark: `Owner scope unavailable | ${period.period}`,
      summary: {
        asset_count: 0,
        occupied_count: 0,
        active_lease_count: 0,
        gross_earned_rent: '0',
        owner_entitlement: '0',
        management_fee: '0',
        owner_adjustments: '0',
        paid_out: '0',
      },
      scope: [] as SafeRow[],
      occupancies: [] as SafeRow[],
      leases: [] as SafeRow[],
      earnings: [] as SafeRow[],
      adjustments: [] as SafeRow[],
      settlements: [] as SafeRow[],
      payouts: [] as SafeRow[],
      complaints: [] as SafeRow[],
      maintenance: [] as SafeRow[],
      notifications: [] as SafeRow[],
    };
  }

  private invalid(field: string): never {
    throw new InternalServerErrorException({
      code: 'OWNER_REPORT_DATA_INVALID',
      message: `Owner report data is invalid: ${field}`,
    });
  }
  private singleRow(rows: unknown, field: string): Record<string, unknown> {
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !rows[0] ||
      typeof rows[0] !== 'object' ||
      Array.isArray(rows[0])
    )
      return this.invalid(field);
    return rows[0] as Record<string, unknown>;
  }
  private text(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) return this.invalid(field);
    return value;
  }
  private nullableText(value: unknown, field: string): string | null {
    return value === null ? null : this.text(value, field);
  }
  private date(value: unknown, field: string): string {
    const parsed = this.text(value, field);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return this.invalid(field);
    return parsed;
  }
  private nullableDate(value: unknown, field: string): string | null {
    return value === null ? null : this.date(value, field);
  }
  private nullablePeriod(value: unknown, field: string): string | null {
    if (value === null) return null;
    const parsed = this.text(value, field);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed)) return this.invalid(field);
    return parsed;
  }
  private timestamp(value: unknown, field: string): string {
    const parsed = this.text(value, field);
    if (Number.isNaN(Date.parse(parsed))) return this.invalid(field);
    return parsed;
  }
  private enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
    const parsed = this.text(value, field);
    if (!values.includes(parsed as T)) return this.invalid(field);
    return parsed as T;
  }
  private count(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      return this.invalid(field);
    return value;
  }
  private money(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return this.invalid(field);
    return value;
  }
  private signedMoney(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^(0|-?[1-9]\d*)$/.test(value)) return this.invalid(field);
    return value;
  }

  private rows(
    value: unknown,
    field: string,
    schema: Record<string, string | readonly string[]>,
  ): SafeRow[] {
    if (!Array.isArray(value)) return this.invalid(field);
    return value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return this.invalid(`${field}.${index}`);
      const source = item as Record<string, unknown>;
      if (
        Object.keys(source).length !== Object.keys(schema).length ||
        Object.keys(source).some((key) => !(key in schema))
      )
        return this.invalid(`${field}.${index}`);
      const target: SafeRow = {};
      for (const [key, kind] of Object.entries(schema)) {
        const path = `${field}.${index}.${key}`;
        target[key] = Array.isArray(kind)
          ? this.enumValue(source[key], kind, path)
          : kind === 'text'
            ? this.text(source[key], path)
            : kind === 'date'
              ? this.date(source[key], path)
              : kind === 'nullableDate'
                ? this.nullableDate(source[key], path)
                : kind === 'timestamp'
                  ? this.timestamp(source[key], path)
                  : kind === 'money'
                    ? this.money(source[key], path)
                    : kind === 'signedMoney'
                      ? this.signedMoney(source[key], path)
                      : this.invalid(path);
      }
      return target;
    });
  }

  private reportSections(report: SafeReport): Array<{ name: string; rows: string[][] }> {
    const objectRows = (rows: SafeRow[]) =>
      rows.map((row) => Object.values(row).map((value) => value ?? ''));
    const table = (rows: SafeRow[]) => [Object.keys(rows[0] ?? {}), ...objectRows(rows)];
    return [
      {
        name: 'Summary',
        rows: [
          ['Watermark', report.watermark],
          ['Period', report.period.period],
          ['Period start', report.period.start],
          ['Period end', report.period.end],
          ['Scope checksum', report.scope_checksum],
          ...Object.entries(report.summary).map(([key, value]) => [key, String(value)]),
        ],
      },
      { name: 'Scope', rows: table(report.scope) },
      { name: 'Occupancies', rows: table(report.occupancies) },
      { name: 'Leases', rows: table(report.leases) },
      { name: 'Earnings', rows: table(report.earnings) },
      { name: 'Adjustments', rows: table(report.adjustments) },
      { name: 'Settlements', rows: table(report.settlements) },
      { name: 'Payouts', rows: table(report.payouts) },
      { name: 'Complaints', rows: table(report.complaints) },
      { name: 'Maintenance', rows: table(report.maintenance) },
      { name: 'Notifications', rows: table(report.notifications) },
    ];
  }

  private async toPdf(report: SafeReport): Promise<Buffer> {
    const lines = this.reportSections(report).flatMap((section) => [
      `[SECTION:${section.name.toUpperCase()}]`,
      ...section.rows.map((row) => row.join(' | ')),
    ]);
    const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / 38)) }, (_, page) =>
      lines.slice(page * 38, (page + 1) * 38),
    );
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const latin = await pdf.embedFont(
      readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff')),
      { subset: true },
    );
    const cyrillic = await pdf.embedFont(
      readFileSync(
        require.resolve('@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff'),
      ),
      { subset: true },
    );
    const segments = (line: string) => {
      const result: Array<{ text: string; font: PDFFont }> = [];
      for (const character of line) {
        const font = /[\u0400-\u04ff]/u.test(character) ? cyrillic : latin;
        const previous = result.at(-1);
        if (previous?.font === font) previous.text += character;
        else result.push({ text: character, font });
      }
      return result;
    };
    for (const sourceLines of pages) {
      const page = pdf.addPage([612, 792]);
      sourceLines.forEach((line, index) => {
        let x = 36;
        for (const segment of segments(line)) {
          page.drawText(segment.text, {
            x,
            y: 760 - index * 19,
            size: 8,
            font: segment.font,
            color: rgb(0, 0, 0),
          });
          x += segment.font.widthOfTextAtSize(segment.text, 8);
        }
      });
    }
    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }

  private toXlsx(report: SafeReport): Buffer {
    const sections = this.reportSections(report);
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (character) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
      );
    const sheetXml = (rows: string[][]) =>
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, column) => `<c r="${String.fromCharCode(65 + column)}${rowIndex + 1}" t="inlineStr"><is><t>${escape(cell)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
    const overrides = sections
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('');
    const files: Array<[string, string]> = [
      [
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`,
      ],
      [
        '_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ],
      [
        'xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sections.map((section, index) => `<sheet name="${escape(section.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
      ],
      [
        'xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sections.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`,
      ],
      ...sections.map((section, index): [string, string] => [
        `xl/worksheets/sheet${index + 1}.xml`,
        sheetXml(section.rows),
      ]),
    ];
    return this.zip(files);
  }

  private zip(files: Array<[string, string]>): Buffer {
    const crc32 = (buffer: Buffer) => {
      let crc = 0xffffffff;
      for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nameBuffer = Buffer.from(name);
      const data = Buffer.from(content);
      const crc = crc32(data);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(nameBuffer.length, 26);
      local.push(header, nameBuffer, data);
      const directory = Buffer.alloc(46);
      directory.writeUInt32LE(0x02014b50, 0);
      directory.writeUInt16LE(20, 4);
      directory.writeUInt16LE(20, 6);
      directory.writeUInt32LE(crc, 16);
      directory.writeUInt32LE(data.length, 20);
      directory.writeUInt32LE(data.length, 24);
      directory.writeUInt16LE(nameBuffer.length, 28);
      directory.writeUInt32LE(offset, 42);
      central.push(directory, nameBuffer);
      offset += header.length + nameBuffer.length + data.length;
    }
    const centralSize = central.reduce((sum, buffer) => sum + buffer.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, ...central, end]);
  }
}
