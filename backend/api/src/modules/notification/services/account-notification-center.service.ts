import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { ListAccountNotificationCenterQueryDto } from '../dto/list-account-notification-center-query.dto';
import {
  AccountNotificationCenterRepository,
  AccountNotificationRow,
  AccountNotificationScope,
} from '../repositories/account-notification-center.repository';
import { AuditActorContext } from '../types/notification.types';

@Injectable()
export class AccountNotificationCenterService {
  constructor(
    private readonly notifications: AccountNotificationCenterRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListAccountNotificationCenterQueryDto) {
    this.assertDates(query);
    const scope = await this.scope(user, query.property_id);
    const result = await this.notifications.list(scope, query);
    return {
      items: result.records.map((row) => this.toItem(row, scope)),
      total: result.total,
      unreadCount: result.unreadCount,
      availableCategories: result.availableCategories,
      availableAssets: result.availableAssets,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
  }

  async unreadCount(user: UserAccessContext, propertyId?: string) {
    const scope = await this.scope(user, propertyId);
    const result = await this.notifications.list(scope, { status: 'unread', limit: 1, offset: 0 });
    return { unreadCount: result.unreadCount };
  }

  async change(
    user: UserAccessContext,
    propertyId: string | undefined,
    action: 'read' | 'archive' | 'read-all' | 'archive-read',
    id?: string,
    context?: AuditActorContext,
  ) {
    const scope = await this.scope(user, propertyId);
    if (id && !(await this.notifications.find(scope, id))) this.notFound();
    const changed = await this.notifications.mutate(scope, action, id);
    if (id && changed.length === 0) this.notFound();
    await this.audit.write({
      actorUserId: user.id,
      propertyId,
      action: action.startsWith('archive') ? 'notification.archive' : 'notification.read',
      resourceType: 'notification',
      resourceId: id,
      afterData: { audience: scope.audience, operation: action, updatedCount: changed.length },
      resultStatus: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      correlationId: context?.correlationId,
    });
    if (!id) return { updatedCount: changed.length };
    const row = await this.notifications.find(scope, id);
    if (!row) return this.notFound();
    return this.toItem(row, scope);
  }

  private async scope(
    user: UserAccessContext,
    propertyId?: string,
  ): Promise<AccountNotificationScope> {
    // A property_id is only sent from the Admin surface. Prefer that explicitly
    // requested operational context for dual-role accounts; Owner and Resident
    // portals deliberately omit it and remain self-scoped.
    const canManageNotifications =
      user.roles.some((role) => ['owner', 'manager', 'admin'].includes(role)) &&
      user.permissions.includes('notification.manage');
    const audience =
      propertyId && canManageNotifications
        ? 'admin'
        : user.roles.includes('property_owner')
          ? 'property_owner'
          : user.roles.includes('resident')
            ? 'resident'
            : 'admin';
    if (audience === 'admin') {
      if (!canManageNotifications) {
        throw new ForbiddenException({
          code: 'NOTIFICATION_SCOPE_DENIED',
          message: 'Notification access denied',
        });
      }
      if (!propertyId)
        throw new BadRequestException({
          code: 'PROPERTY_REQUIRED',
          message: 'property_id is required for operational notifications',
        });
      await this.properties.get(user, propertyId);
    }
    return { userId: user.id, audience, propertyId };
  }

  private assertDates(query: ListAccountNotificationCenterQueryDto) {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({
        code: 'NOTIFICATION_DATE_RANGE_INVALID',
        message: 'from must not be after to',
      });
    }
  }

  private toItem(row: AccountNotificationRow, scope: AccountNotificationScope) {
    const category = row.category;
    // Owner lists intentionally omit the raw operational title/body and all metadata.
    const labels: Record<string, string> = {
      booking: 'Perubahan hunian',
      payments: 'Informasi tagihan',
      rooms: 'Perubahan kondisi aset',
      checkout: 'Perubahan check-out',
      realization: 'Realisasi Owner',
      transfer: 'Transfer Owner',
      service: 'Layanan aset',
      account: 'Informasi akun',
    };
    const ownerTitle =
      row.notification_type.includes('correct') ||
      row.notification_type.includes('cancel') ||
      row.notification_type.includes('reverse')
        ? `${labels[category]} diperbarui`
        : row.notification_type.includes('published')
          ? 'Realisasi Owner diterbitkan'
          : category === 'transfer'
            ? 'Transfer Owner tercatat'
            : ((
                {
                  'lease.check_in_confirmed': 'Hunian dimulai',
                  'lease.checkout.handover': 'Serah-terima check-out tercatat',
                  'room.inspection_resolved': 'Inspeksi kamar diselesaikan',
                  'work_order.status_changed': 'Status perawatan diperbarui',
                } as Record<string, string>
              )[row.source_event_type ?? ''] ?? labels[category]);
    const metadataAmount = row.metadata?.amount;
    const ownerAmount =
      typeof metadataAmount === 'number' || typeof metadataAmount === 'string'
        ? String(metadataAmount)
        : null;
    const ownerBody = [
      row.room_code ? `Aset ${row.room_code}` : null,
      row.realization_reference ? `Dokumen ${row.realization_reference}` : null,
      typeof row.metadata?.period === 'string' &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(row.metadata.period)
        ? `Periode ${row.metadata.period}`
        : null,
      (category === 'realization' || category === 'transfer') &&
      ownerAmount &&
      /^\d{1,16}$/.test(ownerAmount)
        ? `Rp${new Intl.NumberFormat('id-ID').format(Number(ownerAmount))}`
        : null,
      row.metadata?.superseded_by
        ? 'Informasi ini telah digantikan oleh pemberitahuan terbaru.'
        : null,
      row.historical
        ? 'Riwayat pada masa kepemilikan. Buka laporan untuk informasi yang masih diizinkan.'
        : 'Buka rincian untuk melihat status terbaru.',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      id: row.id,
      propertyId: row.property_id,
      notificationType: row.notification_type,
      category,
      title:
        category === 'account'
          ? 'Informasi akun'
          : scope.audience === 'property_owner'
            ? ownerTitle
            : row.title,
      body:
        category === 'account'
          ? 'Ada pembaruan akun. Buka pengaturan akun untuk melihat informasi yang tersedia.'
          : scope.audience === 'property_owner'
            ? ownerBody
            : row.body,
      priority: row.priority,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      relatedHref: this.destination(row, scope),
      superseded: Boolean(row.metadata?.superseded_by),
    };
  }

  private destination(row: AccountNotificationRow, scope: AccountNotificationScope): string | null {
    const id =
      row.source_resource_id && /^[a-f0-9-]{36}$/i.test(row.source_resource_id)
        ? row.source_resource_id
        : null;
    if (scope.audience === 'property_owner') {
      if (row.realization_id)
        return `/property-owners/portal/reports?realizationId=${encodeURIComponent(row.realization_id)}${row.source_event_type?.startsWith('property_owner.transfer.') && id ? `&transferId=${encodeURIComponent(id)}` : ''}`;
      if (row.historical) return '/property-owners/portal/reports';
      if (row.category === 'account') return '/property-owners/portal/account';
      if (row.room_code)
        return `/property-owners/portal/assets/${encodeURIComponent(row.room_code)}`;
      return null;
    }
    if (scope.audience === 'resident') {
      if (row.category === 'payments') return '/billing';
      if (row.category === 'service' || row.category === 'rooms')
        return row.notification_type.startsWith('vehicle.') ? '/vehicles' : '/complaints';
      if (row.category === 'booking' || row.category === 'checkout') return '/info';
      return row.category === 'account' ? '/profile' : null;
    }
    if (row.realization_id)
      return `/reports/property-owners/${encodeURIComponent(row.realization_id)}`;
    if (row.related_lease_id) return `/tenants/${encodeURIComponent(row.related_lease_id)}`;
    if (row.category === 'payments') return '/payments';
    if (row.category === 'booking') return '/booking-leads';
    if (row.category === 'checkout') return '/tenants';
    if (row.category === 'rooms' || row.category === 'service')
      return row.notification_type.startsWith('vehicle.') ? '/vehicles' : '/complaints';
    return null;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'NOTIFICATION_NOT_FOUND',
      message: 'Notification not found',
    });
  }
}
