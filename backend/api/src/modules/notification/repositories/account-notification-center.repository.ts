import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { ListAccountNotificationCenterQueryDto } from '../dto/list-account-notification-center-query.dto';
import { NotificationPriority, NotificationStatus } from '../types/notification.types';

export type NotificationAudience = 'admin' | 'resident' | 'property_owner';
export type AccountNotificationScope = {
  userId: string;
  audience: NotificationAudience;
  propertyId?: string;
};
export type AccountNotificationRow = {
  id: string;
  property_id: string;
  notification_type: string;
  source_event_type: string | null;
  source_resource_id: string | null;
  metadata: Record<string, unknown> | null;
  category: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  read_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  room_code: string | null;
  realization_id: string | null;
  realization_reference: string | null;
  historical: boolean;
  member_ids: string[];
  room_codes: string[];
  related_lease_id: string | null;
};

@Injectable()
export class AccountNotificationCenterRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(scope: AccountNotificationScope, query: ListAccountNotificationCenterQueryDto) {
    const result = await this.database.client.query<{
      items: AccountNotificationRow[];
      total: number;
      unread_count: number;
      categories: string[];
      assets: string[];
    }>(
      `${this.scopeSql()}, filtered AS (
      SELECT * FROM inbox
      WHERE CASE WHEN $4::text = 'archived' THEN status = 'archived'
                 ELSE (expires_at IS NULL OR expires_at > now()) AND
                      CASE WHEN $4::text = 'active' THEN status <> 'archived' ELSE status = $4 END END
        AND ($5::text IS NULL OR category = $5)
        AND ($6::text IS NULL OR priority = $6)
        AND ($12::text IS NULL OR notification_type = $12)
        AND ($13::text IS NULL OR COALESCE(NULLIF(metadata->>'period',''),to_char(created_at AT TIME ZONE 'Asia/Jakarta','YYYY-MM'))=$13)
        AND ($14::text IS NULL OR $14::text=ANY(room_codes))
        AND ($7::text IS NULL OR ($3::text<>'property_owner' AND (title ILIKE '%' || $7 || '%' OR body ILIKE '%' || $7 || '%'))
             OR room_code ILIKE '%' || $7 || '%' OR realization_reference ILIKE '%' || $7 || '%')
        AND ($8::text IS NULL OR created_at >= CASE WHEN length($8::text)=10 THEN $8::date::timestamp AT TIME ZONE 'Asia/Jakarta' ELSE $8::timestamptz END)
        AND ($9::text IS NULL OR CASE WHEN length($9::text)=10 THEN created_at < ($9::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta' ELSE created_at <= $9::timestamptz END)
    ), page AS (SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT $10 OFFSET $11)
    SELECT COALESCE((SELECT json_agg(page ORDER BY created_at DESC, id DESC) FROM page), '[]') AS items,
           (SELECT count(*)::int FROM filtered) AS total,
           (SELECT count(*)::int FROM inbox WHERE status='unread' AND (expires_at IS NULL OR expires_at > now())) AS unread_count,
           ARRAY(SELECT DISTINCT category FROM inbox ORDER BY category) AS categories,
           ARRAY(SELECT DISTINCT unnest(room_codes) AS code FROM inbox ORDER BY code) AS assets`,
      [
        ...this.scopeValues(scope),
        query.status ?? 'unread',
        query.category ?? null,
        query.priority ?? null,
        query.search?.trim() || null,
        query.from ?? null,
        query.to ?? null,
        query.limit ?? 20,
        query.offset ?? 0,
        query.notification_type ?? null,
        query.period ?? null,
        query.asset ?? null,
      ],
    );
    const row = result.rows[0];
    return {
      records: row.items,
      total: row.total,
      unreadCount: row.unread_count,
      availableCategories: row.categories,
      availableAssets: row.assets,
    };
  }

  async mutate(
    scope: AccountNotificationScope,
    action: 'read' | 'archive' | 'read-all' | 'archive-read',
    id?: string,
  ) {
    const result = await this.database.client.query<{ notification_id: string }>(
      `${this.scopeSql()}, targets AS (
      SELECT DISTINCT unnest(member_ids)::uuid AS notification_id FROM inbox
      WHERE ($4::uuid IS NULL OR id = $4::uuid OR $4::uuid = ANY(member_ids))
        AND CASE WHEN $5::text='read-all' THEN status='unread' AND (expires_at IS NULL OR expires_at>now())
                 WHEN $5::text='archive-read' THEN status='read' AND (expires_at IS NULL OR expires_at>now())
                 ELSE true END
    ), changed AS (
    INSERT INTO notification_account_states(notification_id,user_id,notification_status,read_at,archived_at)
    SELECT notification_id,$1,
           CASE WHEN $5::text IN ('archive','archive-read') THEN 'archived' ELSE 'read' END,
           CASE WHEN $5::text IN ('read','read-all') THEN now() END,
           CASE WHEN $5::text IN ('archive','archive-read') THEN now() END FROM targets
    ON CONFLICT(notification_id,user_id) DO UPDATE SET
      notification_status=CASE WHEN notification_account_states.notification_status='archived' THEN 'archived' ELSE EXCLUDED.notification_status END,
      read_at=COALESCE(notification_account_states.read_at,EXCLUDED.read_at),
      archived_at=COALESCE(notification_account_states.archived_at,EXCLUDED.archived_at), updated_at=now()
    RETURNING notification_id)
    SELECT inbox.id AS notification_id FROM inbox WHERE EXISTS (
      SELECT 1 FROM changed WHERE changed.notification_id=ANY(inbox.member_ids)
    )`,
      [...this.scopeValues(scope), id ?? null, action],
    );
    return result.rows;
  }

  async find(scope: AccountNotificationScope, id: string): Promise<AccountNotificationRow | null> {
    const result = await this.database.client.query<AccountNotificationRow>(
      `${this.scopeSql()}
      SELECT * FROM inbox WHERE id=$4::uuid OR $4::uuid=ANY(member_ids)`,
      [...this.scopeValues(scope), id],
    );
    return result.rows[0] ?? null;
  }

  private scopeValues(scope: AccountNotificationScope) {
    return [scope.userId, scope.propertyId ?? null, scope.audience];
  }

  /** One authorization boundary reused for count, pagination, single and bulk state changes. */
  private scopeSql() {
    return `WITH owners AS (
      SELECT p.id,p.property_id FROM property_owner_profiles p JOIN users u ON u.id=p.user_id
      WHERE p.user_id=$1 AND p.profile_status='active' AND u.user_status='active'
    ), authorized_earnings AS (
      SELECT e.* FROM property_owner_earnings e JOIN owners ON owners.id=e.owner_profile_id AND owners.property_id=e.property_id
      WHERE (e.ownership_kind='building' AND EXISTS (
        SELECT 1 FROM building_owner_assignments a WHERE a.id=e.ownership_assignment_id AND a.owner_profile_id=e.owner_profile_id
          AND a.property_id=e.property_id AND a.effective_from<=e.service_from AND e.service_until<=COALESCE(a.effective_until,'infinity'::date)))
        OR (e.ownership_kind='room' AND EXISTS (
        SELECT 1 FROM room_owner_assignments a WHERE a.id=e.ownership_assignment_id AND a.owner_profile_id=e.owner_profile_id
          AND a.property_id=e.property_id AND a.effective_from<=e.service_from AND e.service_until<=COALESCE(a.effective_until,'infinity'::date)))
    ), authorized_settlements AS (
      SELECT d.* FROM property_owner_settlements d JOIN owners ON owners.id=d.owner_profile_id AND owners.property_id=d.property_id
      WHERE EXISTS(SELECT 1 FROM property_owner_settlement_publications p WHERE p.settlement_id=d.id AND p.publication_status='published')
        AND NOT EXISTS(SELECT 1 FROM property_owner_settlement_lines l WHERE l.settlement_id=d.id
          AND NOT EXISTS(SELECT 1 FROM authorized_earnings e WHERE e.id=l.earning_id))
    ), resource_rooms AS (
      SELECT n.id, c.room_id FROM notifications n JOIN complaints c ON c.id=n.source_resource_id AND c.property_id=n.property_id
        WHERE n.source_event_type LIKE 'complaint.%'
      UNION ALL SELECT n.id,w.room_id FROM notifications n JOIN maintenance_work_orders w ON w.id=n.source_resource_id AND w.property_id=n.property_id
        WHERE n.source_event_type LIKE 'maintenance.%' OR n.source_event_type LIKE 'work_order.%'
      UNION ALL SELECT n.id,o.room_id FROM notifications n JOIN occupancies o ON o.id=n.source_resource_id AND o.property_id=n.property_id
        WHERE n.source_event_type LIKE 'occupancy.%'
      UNION ALL SELECT n.id,l.room_id FROM notifications n JOIN leases l ON l.id=n.source_resource_id AND l.property_id=n.property_id
        WHERE n.source_event_type LIKE 'lease.%'
      UNION ALL SELECT n.id,c.room_id FROM notifications n JOIN lease_checkout_commands c ON c.id=n.source_resource_id AND c.property_id=n.property_id
        WHERE n.source_event_type LIKE 'lease.checkout.%'
      UNION ALL SELECT n.id,l.room_id FROM notifications n JOIN payments p ON p.id=n.source_resource_id AND p.property_id=n.property_id
        JOIN leases l ON l.id=p.lease_id AND l.property_id=p.property_id WHERE n.source_event_type LIKE 'payment.%'
      UNION ALL SELECT n.id,i.room_id FROM notifications n JOIN invoices i ON i.id=n.source_resource_id AND i.property_id=n.property_id
        WHERE n.source_event_type LIKE 'billing.%' OR n.source_event_type LIKE 'invoice.%'
      UNION ALL SELECT n.id,r.id FROM notifications n JOIN rooms r ON r.id=n.source_resource_id AND r.property_id=n.property_id
        WHERE n.source_event_type LIKE 'room.%'
      UNION ALL SELECT n.id,e.room_id FROM notifications n JOIN authorized_earnings e ON e.id=n.source_resource_id AND e.property_id=n.property_id
        WHERE n.source_event_type LIKE 'property_owner.earning.%'
      UNION ALL SELECT n.id,e.room_id FROM notifications n JOIN authorized_settlements d ON d.id=n.source_resource_id AND d.property_id=n.property_id
        JOIN property_owner_settlement_lines l ON l.settlement_id=d.id JOIN authorized_earnings e ON e.id=l.earning_id
        WHERE n.source_event_type LIKE 'property_owner.settlement.%'
      UNION ALL SELECT n.id,e.room_id FROM notifications n JOIN property_owner_payouts p ON p.id=n.source_resource_id AND p.property_id=n.property_id
        JOIN authorized_settlements d ON d.id=p.settlement_id AND d.owner_profile_id=p.owner_profile_id
        JOIN property_owner_settlement_lines l ON l.settlement_id=d.id JOIN authorized_earnings e ON e.id=l.earning_id
        WHERE n.source_event_type LIKE 'property_owner.payout.%'
      UNION ALL SELECT n.id,e.room_id FROM notifications n JOIN property_owner_earning_adjustments a ON a.id=n.source_resource_id AND a.property_id=n.property_id
        JOIN authorized_settlements d ON d.id=a.settlement_id AND d.owner_profile_id=a.owner_profile_id
        JOIN authorized_earnings e ON e.id=a.earning_id WHERE n.source_event_type LIKE 'property_owner.adjustment.%' AND a.adjustment_status='approved'
      UNION ALL SELECT n.id,l.room_id FROM notifications n JOIN property_owner_realizations d ON d.property_id=n.property_id
        JOIN owners ON owners.id=d.owner_profile_id JOIN property_owner_realization_lines l ON l.realization_id=d.id
        WHERE d.published_at IS NOT NULL AND l.room_id IS NOT NULL AND
          ((n.source_event_type LIKE 'property_owner.realization.%' AND d.id=n.source_resource_id) OR
            (n.source_event_type LIKE 'property_owner.transfer.%' AND EXISTS(SELECT 1 FROM property_owner_realization_transfers t WHERE t.id=n.source_resource_id AND t.realization_id=d.id)))
    ), owner_room_scope AS (
      SELECT a.property_id,r.id AS room_id,a.effective_from,a.effective_until,a.assignment_status
      FROM building_owner_assignments a JOIN owners ON owners.id=a.owner_profile_id AND owners.property_id=a.property_id
      JOIN rooms r ON r.building_id=a.building_id AND r.property_id=a.property_id
      UNION ALL SELECT a.property_id,a.room_id,a.effective_from,a.effective_until,a.assignment_status
      FROM room_owner_assignments a JOIN owners ON owners.id=a.owner_profile_id AND owners.property_id=a.property_id
    ), candidate AS (
      SELECT n.*,COALESCE(s.notification_status,'unread') AS account_status,s.read_at AS account_read_at,
        CASE
          WHEN n.metadata->>'category' IN ('booking','payments','rooms','checkout','realization','transfer','service','account') THEN n.metadata->>'category'
          WHEN n.notification_type LIKE 'property_owner.transfer.%' OR n.source_event_type LIKE 'property_owner.transfer.%' OR n.notification_type LIKE 'property_owner.payout.%' THEN 'transfer'
          WHEN n.notification_type LIKE 'property_owner.realization.%' OR n.notification_type LIKE 'property_owner.settlement.%' OR n.notification_type LIKE 'property_owner.earning.%' OR n.notification_type LIKE 'property_owner.adjustment.%' THEN 'realization'
          WHEN n.notification_type LIKE '%checkout%' OR n.notification_type LIKE '%refund%' OR n.source_event_type LIKE 'lease.checkout%' OR n.source_event_type LIKE 'lease_exit.%' THEN 'checkout'
          WHEN n.notification_type LIKE 'billing.%' OR n.notification_type LIKE 'payment.%' OR n.notification_type LIKE 'invoice.%' OR n.notification_type LIKE '%management_fee%' THEN 'payments'
          WHEN n.notification_type LIKE 'booking%' OR n.notification_type LIKE 'lease.%' OR n.notification_type LIKE 'occupancy.%' THEN 'booking'
          WHEN n.notification_type LIKE 'room.%' OR n.notification_type LIKE 'maintenance.%' OR n.notification_type LIKE 'work_order.%' THEN 'rooms'
          WHEN n.notification_type LIKE 'complaint.%' OR n.notification_type LIKE 'vehicle.%' THEN 'service'
          ELSE 'account' END AS category,
        resource.room_code,COALESCE(resource.room_codes,ARRAY[]::text[]) AS room_codes, finance.realization_id,finance.realization_reference,
        COALESCE(related_lease.id,checkout.lease_id) AS related_lease_id,
        COALESCE(resource.historical,false) AS historical,
        n.property_id::text || ':' || COALESCE(NULLIF(n.metadata->>'event_key',''),NULLIF(n.metadata->>'eventKey',''),
          CASE WHEN n.source_event_type IS NOT NULL AND n.source_resource_id IS NOT NULL AND n.correlation_id IS NOT NULL
            THEN n.source_event_type || ':' || n.source_resource_id::text || ':' || n.correlation_id END,n.id::text) AS event_identity
      FROM notifications n
      LEFT JOIN leases related_lease ON related_lease.id=n.source_resource_id AND related_lease.property_id=n.property_id AND n.source_event_type LIKE 'lease.%'
      LEFT JOIN lease_checkout_commands checkout ON checkout.id=n.source_resource_id AND checkout.property_id=n.property_id AND n.source_event_type LIKE 'lease.checkout.%'
      LEFT JOIN notification_account_states s ON s.notification_id=n.id AND s.user_id=$1
      LEFT JOIN LATERAL (
        SELECT min(r.room_code) AS room_code,array_agg(DISTINCT r.room_code) AS room_codes,
          bool_and(NOT EXISTS(SELECT 1 FROM owner_room_scope current_scope WHERE current_scope.room_id=r.id
          AND current_scope.assignment_status='active' AND current_scope.effective_until IS NULL)) AS historical
        FROM resource_rooms rr JOIN rooms r ON r.id=rr.room_id AND r.property_id=n.property_id
        WHERE rr.id=n.id AND ($3::text<>'property_owner' OR n.source_event_type LIKE 'property_owner.realization.%' OR n.source_event_type LIKE 'property_owner.transfer.%' OR EXISTS (
          SELECT 1 FROM owner_room_scope a WHERE a.room_id=r.id AND a.property_id=n.property_id
            AND n.created_at >= a.effective_from::timestamp AT TIME ZONE 'Asia/Jakarta'
            AND n.created_at < COALESCE(a.effective_until,'infinity'::date)::timestamp AT TIME ZONE 'Asia/Jakarta'))
      ) resource ON true
      LEFT JOIN LATERAL (
        SELECT d.id AS realization_id,d.realization_reference
        FROM property_owner_realizations d
        WHERE d.property_id=n.property_id AND ($3::text<>'property_owner' OR
          (d.owner_profile_id IN (SELECT id FROM owners) AND d.published_at IS NOT NULL))
          AND ((n.source_event_type LIKE 'property_owner.realization.%' AND d.id=n.source_resource_id)
            OR (n.source_event_type LIKE 'property_owner.transfer.%' AND EXISTS (
              SELECT 1 FROM property_owner_realization_transfers t WHERE t.id=n.source_resource_id AND t.realization_id=d.id AND t.property_id=n.property_id)))
        LIMIT 1
      ) finance ON true
      WHERE ($2::uuid IS NULL OR n.property_id=$2)
        AND CASE WHEN $3::text='admin' THEN
          (n.recipient_user_id=$1 OR (n.notification_type NOT LIKE 'account.%' AND n.notification_type NOT LIKE 'system.%'
            AND EXISTS(SELECT 1 FROM user_property_roles upr JOIN roles r ON r.id=upr.role_id
              WHERE upr.user_id=n.recipient_user_id AND upr.revoked_at IS NULL
                AND (upr.property_id=n.property_id OR upr.property_id IS NULL) AND r.code IN ('owner','manager','admin'))))
          WHEN $3::text='resident' THEN n.recipient_user_id=$1 AND n.notification_type NOT LIKE '%announcement%'
            AND n.notification_type NOT LIKE 'announce.%' AND COALESCE(n.source_event_type,'') NOT LIKE '%announcement%'
          ELSE n.recipient_user_id=$1 AND (resource.room_code IS NOT NULL OR finance.realization_id IS NOT NULL
            OR ((n.notification_type LIKE 'account.%' OR n.notification_type LIKE 'property_owner.account.%') AND n.source_resource_id=$1
              AND n.property_id IN (SELECT property_id FROM owners))
            OR (n.notification_type LIKE 'property_owner.announcement.%' AND n.property_id IN (SELECT property_id FROM owners))) END
    ), ranked AS (
      SELECT candidate.*,row_number() OVER(PARTITION BY event_identity ORDER BY created_at,id) AS rank,
        array_agg(id) OVER(PARTITION BY event_identity) AS member_ids,
        bool_or(account_status='archived') OVER(PARTITION BY event_identity) AS any_archived,
        bool_or(account_status='read') OVER(PARTITION BY event_identity) AS any_read,
        min(account_read_at) OVER(PARTITION BY event_identity) AS first_read_at
      FROM candidate
    ), inbox AS (
      SELECT id,property_id,notification_type,source_event_type,source_resource_id,metadata,category,title,body,priority,
        CASE WHEN any_archived THEN 'archived' WHEN any_read THEN 'read' ELSE 'unread' END AS status,
        first_read_at AS read_at,expires_at,created_at,room_code,room_codes,realization_id,realization_reference,related_lease_id,historical,member_ids
      FROM ranked WHERE rank=1
    )`;
  }
}
