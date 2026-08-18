import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { W06BillingService } from '../billing/services/w06-billing.service';
import { PropertyService } from '../property/property.service';

export type ReminderMilestone = 'h60' | 'h30' | 'h14';

export type ReminderWorkspaceLeaseRow = {
  lease_id: string;
  resident_id: string;
  resident_name: string;
  room_number: string;
  snapshot_kost_type_name: string;
  lease_end_date: string;
  days_remaining: number;
  outstanding_amount: string | number;
  renewal_state: string | null;
  checkout_state: string | null;
};

export type ReminderWorkspaceItem = ReminderWorkspaceLeaseRow & {
  milestone: ReminderMilestone;
  status: 'action_required';
};

export function buildReminderWorkspaceGroups(rows: ReminderWorkspaceLeaseRow[]) {
  const groups: Record<ReminderMilestone, ReminderWorkspaceItem[]> = { h60: [], h30: [], h14: [] };
  for (const row of rows) {
    const base = { ...row, status: 'action_required' as const };
    if (
      row.days_remaining >= 31 &&
      row.days_remaining <= 60 &&
      !['draft', 'approved', 'activated'].includes(row.renewal_state ?? '')
    ) {
      groups.h60.push({ ...base, milestone: 'h60' });
    }
    if (row.days_remaining >= 15 && row.days_remaining <= 30 && row.renewal_state !== 'activated') {
      groups.h30.push({ ...base, milestone: 'h30' });
    }
    if (
      row.days_remaining >= 0 &&
      row.days_remaining <= 14 &&
      row.checkout_state !== 'completed' &&
      row.checkout_state !== 'cancelled'
    ) {
      groups.h14.push({ ...base, milestone: 'h14' });
    }
  }
  return groups;
}

@Injectable()
export class ReminderWorkspaceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly billing: W06BillingService,
  ) {}

  async workspace(user: UserAccessContext, propertyId: string) {
    await this.properties.get(user, propertyId);
    const clock = await this.database.client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    const today = clock.rows[0]?.today;
    if (!today) throw new Error('Authoritative Jakarta date is unavailable');
    const leases = await this.database.client.query<ReminderWorkspaceLeaseRow>(
      `WITH clock AS (SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS today)
       SELECT l.id AS lease_id,l.resident_id,resident.full_name AS resident_name,
              room.number AS room_number,l.snapshot_kost_type_name,l.end_date::text AS lease_end_date,
              GREATEST(l.end_date-clock.today,0)::int AS days_remaining,
              COALESCE(arrears.outstanding_amount,0) AS outstanding_amount,
              renewal.state AS renewal_state,checkout.state AS checkout_state
       FROM leases l
       JOIN residents resident ON resident.id=l.resident_id AND resident.property_id=l.property_id
       JOIN rooms room ON room.id=l.room_id AND room.property_id=l.property_id
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
       WHERE l.property_id=$1 AND l.lease_status='active' AND l.end_date IS NOT NULL
       ORDER BY l.end_date ASC,l.id ASC`,
      [propertyId],
    );
    const groups = buildReminderWorkspaceGroups(leases.rows);
    const currentMonth = await this.billing.currentWorklist(user, {
      property_id: propertyId,
      month: `${today.slice(0, 7)}-01`,
      limit: 100,
      offset: 0,
      sort: 'due_date_asc',
    });
    return {
      data: {
        as_of_date: today,
        groups,
        current_month_bills: currentMonth,
        badge_count:
          currentMonth.meta.total + groups.h60.length + groups.h30.length + groups.h14.length,
      },
    };
  }
}
