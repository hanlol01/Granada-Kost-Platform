import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserAccessContext } from '../iam/types/iam.types';
import type { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto';
import {
  DashboardRepository,
  type DashboardRecentLease,
  type DashboardRecentPayment,
} from './dashboard.repository';

type DashboardCoreData = {
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
  timezone: 'Asia/Jakarta';
  generated_at: string;
  period_start: string;
  period_end: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly dashboard: DashboardRepository) {}

  async getCoreSummary(user: UserAccessContext, query: DashboardSummaryQueryDto) {
    const propertyId = query.property_id;
    if (!propertyId) {
      throw new BadRequestException({
        code: 'PROPERTY_ID_REQUIRED',
        message: 'property_id is required',
      });
    }

    const authorizedScope = user.roles.includes('owner') || user.propertyIds.includes(propertyId);
    const snapshot = await this.dashboard.getCoreSnapshot(propertyId, authorizedScope);

    if (!snapshot.property_exists) {
      throw new NotFoundException({
        code: 'PROPERTY_NOT_FOUND',
        message: 'Property not found',
      });
    }

    if (!authorizedScope) {
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'User is not allowed to access this property',
      });
    }

    const data: DashboardCoreData = {
      active_leases: snapshot.active_leases,
      active_residents: snapshot.active_residents,
      rooms_total: snapshot.rooms_total,
      rooms_vacant: snapshot.rooms_vacant,
      rooms_occupied: snapshot.rooms_occupied,
      rooms_maintenance: snapshot.rooms_maintenance,
      outstanding_amount: snapshot.outstanding_amount,
      overdue_invoice_count: snapshot.overdue_invoice_count,
      recent_leases: snapshot.recent_leases.map((lease) => ({
        id: lease.id,
        lease_code: lease.lease_code,
        lease_status: lease.lease_status,
        start_date: lease.start_date,
        created_at: lease.created_at,
        room: {
          number: lease.room.number,
        },
      })),
      recent_payments: snapshot.recent_payments.map((payment) => ({
        id: payment.id,
        payment_code: payment.payment_code,
        payment_status: payment.payment_status,
        payment_method: payment.payment_method,
        amount: payment.amount,
        paid_at: payment.paid_at,
        verified_at: payment.verified_at,
        created_at: payment.created_at,
      })),
      timezone: 'Asia/Jakarta',
      generated_at: snapshot.generated_at.toISOString(),
      period_start: snapshot.period_start.toISOString(),
      period_end: snapshot.period_end.toISOString(),
    };

    return { data };
  }
}
