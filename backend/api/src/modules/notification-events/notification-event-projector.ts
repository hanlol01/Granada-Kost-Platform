import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  InboxBusinessEvent,
  NOTIFICATION_EVENT_TYPES,
  notificationEventContent,
} from './notification-event-content';

type Source = {
  lease_id: string | null;
  resident_id: string | null;
  room_id: string | null;
  realization_id: string | null;
  owner_profile_id: string | null;
  room_number?: string | null;
  target_user_id?: string | null;
};
type Recipient = { user_id: string; audience: 'admin' | 'resident' | 'owner' };
const OWNER_ROOM_EVENTS = new Set([
  'lease.check_in_confirmed',
  'lease.checkout.handover',
  'room.inspection_resolved',
  'work_order.status_changed',
]);
const OWNER_FINANCIAL_EVENTS = new Set([
  'property_owner.realization.published',
  'property_owner.transfer.verified',
  'property_owner.realization.corrected',
]);
const ADMIN_ONLY = new Set([
  'complaint.sla_response_breached',
  'complaint.sla_resolution_breached',
  'booking_lead_hold.expired',
  'lease.activation_attention_required',
  'lease.automatic_activation_failed',
  'lease.checkout.inspection',
  'room.inspection_resolved',
]);

/** Independent inbox consumer. Never acknowledges an outbox event for other consumers. */
@Injectable()
export class NotificationEventProjector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventProjector.name);
  private timer?: NodeJS.Timeout;
  private destroyed = false;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.schedule();
  }
  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async runOnce(): Promise<number> {
    return this.database.transaction(async (client) => {
      const lock = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtextextended('notification-event-projector',0)) AS acquired`,
      );
      if (lock.rows[0]?.acquired !== true) return 0;
      const events = await client.query<InboxBusinessEvent>(
        `SELECT event.id,event.property_id,event.event_key,event.event_type,event.aggregate_type,
                event.aggregate_id,event.payload,event.created_at
           FROM business_events event
           JOIN notification_event_projection_state activation ON activation.id=true
          WHERE event.created_at>=activation.activated_at
            AND event.event_type=ANY($1::text[])
            AND NOT EXISTS(SELECT 1 FROM notification_event_projections done WHERE done.event_id=event.id)
          ORDER BY event.created_at,event.id LIMIT 50 FOR UPDATE OF event SKIP LOCKED`,
        [NOTIFICATION_EVENT_TYPES],
      );
      for (const event of events.rows) {
        const source = await this.source(client, event);
        if (source) {
          const recipients = await this.recipients(client, event, source);
          for (const recipient of recipients) await this.insert(client, event, source, recipient);
        }
        await client.query(
          `INSERT INTO notification_event_projections(event_id) VALUES($1) ON CONFLICT DO NOTHING`,
          [event.id],
        );
      }
      return events.rows.length;
    });
  }

  private schedule(): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(() =>
          this.logger.error(
            'Notification event projection failed; committed events will be retried.',
          ),
        )
        .finally(() => this.schedule());
    }, 15_000);
    this.timer.unref();
  }

  private async source(client: PoolClient, event: InboxBusinessEvent): Promise<Source | null> {
    const [property, resource] = [event.property_id, event.aggregate_id];
    let result;
    if (event.aggregate_type === 'user' && event.event_type.startsWith('account.')) {
      result = await client.query<Source>(
        `SELECT id AS target_user_id,NULL::uuid AS lease_id,NULL::uuid AS resident_id,
        NULL::uuid AS room_id,NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id
        FROM users WHERE id=$1 AND user_status='active'`,
        [resource],
      );
    } else if (event.event_type === 'property_owner.password_reset') {
      result = await client.query<Source>(
        `SELECT user_id AS target_user_id,NULL::uuid AS lease_id,NULL::uuid AS resident_id,
        NULL::uuid AS room_id,NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id
        FROM property_owner_profiles WHERE id=$2 AND property_id=$1`,
        [property, resource],
      );
    } else if (event.aggregate_type === 'booking_lead') {
      result = await client.query<Source>(
        `SELECT NULL::uuid AS lease_id,NULL::uuid AS resident_id,room_id,
        NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id FROM booking_leads WHERE id=$2 AND property_id=$1`,
        [property, resource],
      );
    } else if (
      event.aggregate_type === 'property_owner_realization' ||
      event.aggregate_type === 'property_owner_realization_transfer'
    ) {
      result = await client.query<Source>(
        `SELECT NULL::uuid AS lease_id,NULL::uuid AS resident_id,NULL::uuid AS room_id,
                realization.id AS realization_id,realization.owner_profile_id
           FROM property_owner_realizations realization
          WHERE realization.property_id=$1 AND realization.id=
            CASE WHEN $3='property_owner_realization_transfer' THEN
              (SELECT realization_id FROM property_owner_realization_transfers WHERE id=$2 AND property_id=$1 AND transfer_status='succeeded')
            ELSE $2::uuid END`,
        [property, resource, event.aggregate_type],
      );
    } else if (event.aggregate_type === 'room') {
      result = await client.query<Source>(
        `SELECT NULL::uuid AS lease_id,NULL::uuid AS resident_id,id AS room_id,
        NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id FROM rooms WHERE id=$2 AND property_id=$1`,
        [property, resource],
      );
    } else if (
      event.aggregate_type === 'complaint' ||
      event.aggregate_type === 'maintenance_work_order'
    ) {
      result =
        event.aggregate_type === 'complaint'
          ? await client.query<Source>(
              `SELECT NULL::uuid AS lease_id,resident_id,room_id,NULL::uuid AS realization_id,
            NULL::uuid AS owner_profile_id FROM complaints WHERE id=$2 AND property_id=$1`,
              [property, resource],
            )
          : await client.query<Source>(
              `SELECT NULL::uuid AS lease_id,complaint.resident_id,work.room_id,NULL::uuid AS realization_id,
            NULL::uuid AS owner_profile_id FROM maintenance_work_orders work
            LEFT JOIN complaints complaint ON complaint.id=work.complaint_id AND complaint.property_id=work.property_id
            WHERE work.id=$2 AND work.property_id=$1`,
              [property, resource],
            );
    } else if (event.aggregate_type === 'vehicle' || event.aggregate_type === 'parking_slot') {
      const vehicleId =
        event.aggregate_type === 'vehicle' ? resource : this.uuid(event.payload.vehicle_id);
      if (!vehicleId) return null;
      result = await client.query<Source>(
        `SELECT NULL::uuid AS lease_id,resident_id,NULL::uuid AS room_id,
        NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id FROM vehicles WHERE id=$2 AND property_id=$1`,
        [property, vehicleId],
      );
    } else if (event.aggregate_type === 'booking_lead_hold') {
      result = await client.query<Source>(
        `SELECT NULL::uuid AS lease_id,NULL::uuid AS resident_id,room_id,
        NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id FROM booking_lead_holds WHERE id=$2 AND property_id=$1`,
        [property, resource],
      );
    } else {
      const leaseSql: Record<string, string> = {
        lease: '$2::uuid',
        payment: '(SELECT lease_id FROM payments WHERE id=$2 AND property_id=$1)',
        payment_proof:
          '(SELECT invoice.lease_id FROM payment_proofs proof JOIN invoices invoice ON invoice.id=proof.invoice_id AND invoice.property_id=proof.property_id WHERE proof.id=$2 AND proof.property_id=$1)',
        invoice: '(SELECT lease_id FROM invoices WHERE id=$2 AND property_id=$1)',
        lease_checkout_command:
          '(SELECT lease_id FROM lease_checkout_commands WHERE id=$2 AND property_id=$1)',
      };
      if (!leaseSql[event.aggregate_type]) return null;
      result = await client.query<Source>(
        `SELECT lease.id AS lease_id,lease.resident_id,lease.room_id,
        NULL::uuid AS realization_id,NULL::uuid AS owner_profile_id FROM leases lease
        WHERE lease.property_id=$1 AND lease.id=${leaseSql[event.aggregate_type]}`,
        [property, resource],
      );
    }
    const source = result.rows[0];
    if (!source) return null;
    if (source.room_id) {
      const room = await client.query<{ number: string }>(
        `SELECT number FROM rooms WHERE property_id=$1 AND id=$2`,
        [property, source.room_id],
      );
      source.room_number = room.rows[0]?.number ?? null;
    }
    if (
      event.aggregate_type === 'payment' &&
      event.payload.payment_purpose === 'management_fee' &&
      (event.event_type === 'payment.verified' ||
        (event.event_type === 'payment.recorded' && event.payload.payment_status === 'verified'))
    ) {
      source.owner_profile_id =
        event.payload.owner_fee_payer === 'owner'
          ? this.uuid(event.payload.owner_profile_id)
          : null;
    }
    return source;
  }

  private async recipients(
    client: PoolClient,
    event: InboxBusinessEvent,
    source: Source,
  ): Promise<Recipient[]> {
    if (
      event.event_type.startsWith('account.') ||
      event.event_type === 'property_owner.password_reset'
    ) {
      if (!source.target_user_id) return [];
      const self = await client.query<Recipient>(
        `SELECT id AS user_id,'resident'::text AS audience FROM users WHERE id=$1 AND user_status='active'`,
        [source.target_user_id],
      );
      return self.rows;
    }
    const admins = await client.query<Recipient>(
      `SELECT DISTINCT account.id AS user_id,'admin'::text AS audience FROM users account
        JOIN user_property_roles membership ON membership.user_id=account.id AND membership.revoked_at IS NULL
        JOIN roles role ON role.id=membership.role_id
        WHERE account.user_status='active' AND role.code IN('admin','manager','owner')
          AND (membership.property_id=$1 OR (membership.property_id IS NULL AND role.code='owner'))`,
      [event.property_id],
    );
    const recipients = [...admins.rows];
    if (source.resident_id && !ADMIN_ONLY.has(event.event_type) && !source.owner_profile_id) {
      const resident = await client.query<Recipient>(
        `SELECT account.id AS user_id,'resident'::text AS audience FROM residents resident
        JOIN users account ON account.id=resident.user_id AND account.user_status='active'
        WHERE resident.id=$2 AND resident.property_id=$1`,
        [event.property_id, source.resident_id],
      );
      recipients.push(...resident.rows);
    }
    const ownerRoomEvent =
      OWNER_ROOM_EVENTS.has(event.event_type) &&
      (event.event_type !== 'work_order.status_changed' ||
        ['in_progress', 'completed', 'verified'].includes(String(event.payload.to_status)));
    if (
      (source.owner_profile_id &&
        (OWNER_FINANCIAL_EVENTS.has(event.event_type) ||
          event.payload.payment_purpose === 'management_fee')) ||
      ownerRoomEvent
    ) {
      // Operational ownership follows active assignments (ADR 0005), never legacy date columns.
      // Assignment creation time also prevents delivering a queued old event to a new Owner.
      const owners = await client.query<Recipient>(
        `SELECT DISTINCT account.id AS user_id,'owner'::text AS audience
           FROM property_owner_profiles profile JOIN users account ON account.id=profile.user_id AND account.user_status='active'
          WHERE profile.property_id=$1 AND profile.profile_status='active'
            AND ($2::uuid IS NULL OR profile.id=$2)
            AND EXISTS (
              SELECT 1 FROM rooms room WHERE room.property_id=$1
                AND (($3::uuid IS NOT NULL AND room.id=$3) OR ($4::uuid IS NOT NULL AND EXISTS(
                  SELECT 1 FROM property_owner_realization_lines line WHERE line.realization_id=$4 AND line.property_id=$1 AND line.room_id=room.id)))
                AND (EXISTS(SELECT 1 FROM room_owner_assignments assignment WHERE assignment.property_id=$1
                  AND assignment.owner_profile_id=profile.id AND assignment.room_id=room.id AND assignment.assignment_status='active'
                  AND assignment.created_at<=$5)
                OR EXISTS(SELECT 1 FROM building_owner_assignments assignment WHERE assignment.property_id=$1
                  AND assignment.owner_profile_id=profile.id AND assignment.building_id=room.building_id AND assignment.assignment_status='active'
                  AND assignment.created_at<=$5)))`,
        [
          event.property_id,
          source.owner_profile_id,
          source.room_id,
          source.realization_id,
          event.created_at,
        ],
      );
      recipients.push(...owners.rows);
    }
    return [...new Map(recipients.map((recipient) => [recipient.user_id, recipient])).values()];
  }

  private async insert(
    client: PoolClient,
    event: InboxBusinessEvent,
    source: Source,
    recipient: Recipient,
  ): Promise<void> {
    const content = notificationEventContent(event, recipient.audience === 'owner');
    if (!content) return;
    const metadata = {
      category:
        recipient.audience === 'owner' && event.event_type === 'lease.checkout.handover'
          ? 'rooms'
          : content.category,
      event_key: event.event_key,
      eventKey: event.event_key,
      audience: recipient.audience,
      lease_id: recipient.audience === 'owner' ? null : source.lease_id,
      resident_id: recipient.audience === 'owner' ? null : source.resident_id,
      room_id: source.room_id,
      realization_id: source.realization_id,
      transfer_id:
        event.event_type === 'property_owner.transfer.verified' ? event.aggregate_id : null,
      period: typeof event.payload.period === 'string' ? event.payload.period.slice(0, 7) : null,
      amount: this.amountSnapshot(event.payload),
      reference: typeof event.payload.reference === 'string' ? event.payload.reference : null,
      ...(event.aggregate_type === 'booking_lead' ? { booking_lead_id: event.aggregate_id } : {}),
      ...(event.event_type === 'booking_lead_hold.expired'
        ? {
            booking_lead_id: this.uuid(
              event.payload.booking_lead_id ?? event.payload.bookingLeadId,
            ),
          }
        : {}),
    };
    if (
      event.event_type === 'property_owner.realization.published' ||
      event.event_type === 'property_owner.transfer.verified'
    ) {
      const correction = await client.query<{ id: string }>(
        `SELECT id FROM notifications WHERE property_id=$1 AND recipient_user_id=$2
          AND source_event_type='property_owner.realization.corrected' AND source_resource_id=$3
          AND created_at>$4 ORDER BY created_at DESC,id DESC LIMIT 1`,
        [event.property_id, recipient.user_id, source.realization_id, event.created_at],
      );
      if (correction.rows[0]) Object.assign(metadata, { superseded_by: correction.rows[0].id });
    }
    const created = await client.query<{ id: string }>(
      `INSERT INTO notifications(property_id,recipient_user_id,notification_type,priority,title,body,metadata,
        source_event_type,source_resource_id,expires_at,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$3,$8,NULL,$9) RETURNING id`,
      [
        event.property_id,
        recipient.user_id,
        event.event_type,
        content.priority,
        content.title,
        `${source.room_number ? `Kamar ${source.room_number}. ` : ''}${content.body}`,
        JSON.stringify(metadata),
        event.aggregate_id,
        event.created_at,
      ],
    );
    if (event.event_type === 'property_owner.realization.corrected') {
      await client.query(
        `UPDATE notifications SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('superseded_by',$3::text)
        WHERE property_id=$1 AND recipient_user_id=$2 AND created_at<$4
          AND (source_event_type='property_owner.realization.published' AND source_resource_id=$5
            OR source_event_type='property_owner.transfer.verified' AND metadata->>'realization_id'=$5::text)
          AND metadata->>'superseded_by' IS NULL`,
        [
          event.property_id,
          recipient.user_id,
          created.rows[0].id,
          event.created_at,
          source.realization_id,
        ],
      );
    }
  }

  private uuid(value: unknown): string | null {
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  }

  private amountSnapshot(payload: Record<string, unknown>): number | null {
    const value = payload.entitlement_amount ?? payload.amount;
    const amount = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(amount) ? amount : null;
  }
}
