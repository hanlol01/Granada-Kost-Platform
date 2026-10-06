import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

/** Only the event identity enters the outbox; no login identifiers or credentials. */
export async function writeAccountNotificationEvent(
  client: PoolClient,
  userId: string,
  eventType:
    | 'account.password_changed'
    | 'account.email_changed'
    | 'account.password_reset'
    | 'account.provisioned',
  eventId: string = randomUUID(),
): Promise<void> {
  await client.query(
    `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
     SELECT DISTINCT scope.property_id,$2||':'||$1::text||':'||scope.property_id::text||':'||$3,$2,'user',$1,
            jsonb_build_object('user_id',$1::text),$1
       FROM (
         SELECT property_id FROM user_property_roles WHERE user_id=$1 AND revoked_at IS NULL AND property_id IS NOT NULL
         UNION SELECT property_id FROM residents WHERE user_id=$1
         UNION SELECT property_id FROM property_owner_profiles WHERE user_id=$1 AND profile_status='active'
         UNION SELECT property.id FROM properties property WHERE EXISTS(
           SELECT 1 FROM user_property_roles membership JOIN roles role ON role.id=membership.role_id
           WHERE membership.user_id=$1 AND membership.property_id IS NULL AND membership.revoked_at IS NULL AND role.code='owner')
       ) scope ON CONFLICT(event_key) DO NOTHING`,
    [userId, eventType, eventId],
  );
}
