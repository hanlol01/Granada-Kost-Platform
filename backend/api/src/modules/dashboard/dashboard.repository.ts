import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';

export type DashboardRecentLease = {
  id: string;
  lease_code: string;
  lease_status: string;
  start_date: string;
  created_at: string;
  room: {
    number: string;
  };
};

export type DashboardRecentPayment = {
  id: string;
  payment_code: string;
  payment_status: string;
  payment_method: string;
  amount: string;
  paid_at: string | null;
  verified_at: string | null;
  created_at: string;
};

export type DashboardSnapshotRow = {
  property_exists: boolean;
  active_leases: number;
  active_residents: number;
  rooms_total: number;
  rooms_vacant: number;
  rooms_occupied: number;
  rooms_maintenance: number;
  outstanding_amount: string;
  overdue_invoice_count: number;
  recent_leases: DashboardRecentLease[];
  recent_payments: DashboardRecentPayment[];
  generated_at: Date;
  period_start: Date;
  period_end: Date;
};

@Injectable()
export class DashboardRepository {
  constructor(private readonly database: DatabaseService) {}

  async getCoreSnapshot(
    propertyId: string,
    authorizedScope: boolean,
  ): Promise<DashboardSnapshotRow> {
    const client = await this.database.client.connect();

    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await this.queryCoreSnapshot(client, propertyId, authorizedScope);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async queryCoreSnapshot(
    client: PoolClient,
    propertyId: string,
    authorizedScope: boolean,
  ): Promise<DashboardSnapshotRow> {
    const result = await client.query<DashboardSnapshotRow>(
      `WITH clock_anchor AS (
         SELECT transaction_timestamp() AS generated_at
       ),
       anchor AS (
         SELECT generated_at,
                (generated_at AT TIME ZONE 'Asia/Jakarta')::date AS jakarta_today,
                date_trunc('month', generated_at AT TIME ZONE 'Asia/Jakarta')
                  AT TIME ZONE 'Asia/Jakarta' AS period_start,
                (date_trunc('month', generated_at AT TIME ZONE 'Asia/Jakarta') + INTERVAL '1 month')
                  AT TIME ZONE 'Asia/Jakarta' AS period_end
         FROM clock_anchor
       ),
       target_property AS (
         SELECT EXISTS(SELECT 1 FROM properties WHERE id = $1::uuid) AS property_exists
       ),
       room_summary AS (
         SELECT count(*)::integer AS rooms_total,
                count(*) FILTER (WHERE room_status = 'vacant')::integer AS rooms_vacant,
                count(*) FILTER (WHERE room_status = 'occupied')::integer AS rooms_occupied,
                count(*) FILTER (
                  WHERE room_status IN ('maintenance', 'requires_review', 'inspection_required')
                )::integer AS rooms_maintenance
         FROM rooms
         WHERE $2::boolean AND property_id = $1::uuid
       ),
       lease_summary AS (
         SELECT count(*) FILTER (WHERE lease_status = 'active')::integer AS active_leases
         FROM leases
         WHERE $2::boolean AND property_id = $1::uuid
       ),
       resident_summary AS (
         SELECT count(*) FILTER (WHERE resident_status = 'active')::integer AS active_residents
         FROM residents
         WHERE $2::boolean AND property_id = $1::uuid
       ),
       active_allocations AS (
         SELECT payment_allocations.invoice_id,
                sum(payment_allocations.allocated_amount) AS allocated_amount
         FROM payment_allocations
         JOIN invoices ON invoices.id = payment_allocations.invoice_id
         WHERE $2::boolean
           AND invoices.property_id = $1::uuid
           AND payment_allocations.allocation_status = 'active'
         GROUP BY payment_allocations.invoice_id
       ),
       open_invoices AS (
         SELECT invoices.due_date,
                GREATEST(
                  invoices.total_amount - COALESCE(active_allocations.allocated_amount, 0),
                  0
                ) AS outstanding_amount
         FROM invoices
         LEFT JOIN active_allocations ON active_allocations.invoice_id = invoices.id
         WHERE $2::boolean
           AND invoices.property_id = $1::uuid
           AND invoices.invoice_status IN ('issued', 'unpaid', 'partially_paid', 'overdue')
       ),
       invoice_summary AS (
         SELECT COALESCE(sum(open_invoices.outstanding_amount), 0)::text AS outstanding_amount,
                count(*) FILTER (
                  WHERE open_invoices.outstanding_amount > 0
                    AND open_invoices.due_date < anchor.jakarta_today
                )::integer AS overdue_invoice_count
         FROM open_invoices
         CROSS JOIN anchor
       ),
       recent_lease_rows AS (
         SELECT leases.id,
                leases.lease_code,
                leases.lease_status,
                leases.start_date,
                leases.created_at,
                rooms.number AS room_number
         FROM leases
         JOIN rooms ON rooms.id = leases.room_id
         WHERE $2::boolean AND leases.property_id = $1::uuid
         ORDER BY leases.created_at DESC, leases.id DESC
         LIMIT 5
       ),
       recent_leases AS (
         SELECT COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', id,
                      'lease_code', lease_code,
                      'lease_status', lease_status,
                      'start_date', start_date,
                      'created_at', created_at,
                      'room', jsonb_build_object('number', room_number)
                    )
                    ORDER BY created_at DESC, id DESC
                  ),
                  '[]'::jsonb
                ) AS items
         FROM recent_lease_rows
       ),
       recent_payment_rows AS (
         SELECT payments.id,
                payments.payment_code,
                payments.payment_status,
                payments.payment_method,
                payments.amount::text AS amount,
                payments.paid_at,
                payments.verified_at,
                payments.created_at
         FROM payments
         WHERE $2::boolean AND payments.property_id = $1::uuid
         ORDER BY payments.paid_at DESC NULLS LAST,
                  payments.created_at DESC,
                  payments.id DESC
         LIMIT 5
       ),
       recent_payments AS (
         SELECT COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', id,
                      'payment_code', payment_code,
                      'payment_status', payment_status,
                      'payment_method', payment_method,
                      'amount', amount,
                      'paid_at', paid_at,
                      'verified_at', verified_at,
                      'created_at', created_at
                    )
                    ORDER BY paid_at DESC NULLS LAST, created_at DESC, id DESC
                  ),
                  '[]'::jsonb
                ) AS items
         FROM recent_payment_rows
       )
       SELECT target_property.property_exists,
              lease_summary.active_leases,
              resident_summary.active_residents,
              room_summary.rooms_total,
              room_summary.rooms_vacant,
              room_summary.rooms_occupied,
              room_summary.rooms_maintenance,
              invoice_summary.outstanding_amount,
              invoice_summary.overdue_invoice_count,
              recent_leases.items AS recent_leases,
              recent_payments.items AS recent_payments,
              anchor.generated_at,
              anchor.period_start,
              anchor.period_end
       FROM target_property
       CROSS JOIN room_summary
       CROSS JOIN lease_summary
       CROSS JOIN resident_summary
       CROSS JOIN invoice_summary
       CROSS JOIN recent_leases
       CROSS JOIN recent_payments
       CROSS JOIN anchor`,
      [propertyId, authorizedScope],
    );

    return result.rows[0];
  }
}
