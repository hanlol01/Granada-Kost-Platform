import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Pool, PoolClient } from 'pg';
import { CORE_SEED_IDS } from '../seeds/core-seed.data';
import { databaseConfigFromEnv } from './database-url';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type NotificationResponse = {
  id: string;
  notification_status: 'unread' | 'read' | 'archived';
  notification_type: string;
};

type UnreadCountResponse = {
  unread_count: number;
};

type PreferenceResponse = {
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  digest_mode: boolean;
};

type DeliveryResponse = {
  id: string;
  delivery_status: string;
  recipient_address?: string;
  recipient_address_masked?: string;
  content_snapshot?: string;
  provider_secret?: string;
};

type PropertyNotificationSettings = {
  notification_email_enabled: boolean;
  notification_whatsapp_enabled: boolean;
  notification_push_enabled: boolean;
  notification_retention_days: number;
};

const publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  'http://localhost:',
  'http://127.0.0.1:',
);
const baseUrl = `${publicBaseUrl}/${process.env.API_PREFIX ?? 'api/v1'}`;
const runSuffix = `${Date.now()}`;

async function request<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-correlation-id': `notification-workflow-validation-${runSuffix}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${path} expected ${expectedStatus}, got ${response.status}: ${text}`);
  }

  return data as T;
}

async function requestDenied(method: string, path: string, token: string, body?: unknown): Promise<number> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'x-correlation-id': `notification-workflow-validation-${runSuffix}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} should be denied, got ${response.status}: ${text}`);
  }

  return response.status;
}

async function validationToken(client: PoolClient, email: string): Promise<string> {
  const userResult = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  const user = userResult.rows[0];
  if (!user) {
    throw new Error(`Validation user not found: ${email}. Run db:seed:dev first.`);
  }

  const sessionId = randomUUID();
  await client.query(
    `INSERT INTO user_sessions (
       id, user_id, refresh_token_hash, device_name, expires_at
     )
     VALUES ($1, $2, 'notification-workflow-validation', 'notification-workflow-validation', now() + interval '30 minutes')`,
    [sessionId, user.id],
  );

  return signJwt(
    {
      sub: user.id,
      session_id: sessionId,
    },
    process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-at-least-32-characters',
    Math.floor(Date.now() / 1000) + 30 * 60,
  );
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresAt: number): string {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlJson({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: expiresAt,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function resetNotificationSeedState(client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE notification_preferences
     SET email_enabled = true,
         whatsapp_enabled = false,
         push_enabled = true,
         digest_mode = false,
         quiet_hours_start = NULL,
         quiet_hours_end = NULL,
         updated_at = now()
     WHERE user_id = $1`,
    [CORE_SEED_IDS.devResidentUsers.alpha],
  );
  await client.query(
    `UPDATE notifications
     SET notification_status = CASE
           WHEN id IN ($1, $2) THEN 'unread'
           WHEN id IN ($3, $4) THEN 'read'
           ELSE notification_status
         END,
         read_at = CASE
           WHEN id IN ($1, $2) THEN NULL
           WHEN id IN ($3, $4) THEN now() - interval '1 day'
           ELSE read_at
         END
     WHERE id IN ($1, $2, $3, $4)`,
    [
      CORE_SEED_IDS.devNotifications.invoiceIssued,
      CORE_SEED_IDS.devNotifications.occupancyCheckIn,
      CORE_SEED_IDS.devNotifications.complaintResolved,
      CORE_SEED_IDS.devNotifications.vehicleApproved,
    ],
  );
}

async function notificationSettings(client: PoolClient): Promise<PropertyNotificationSettings> {
  const result = await client.query<PropertyNotificationSettings>(
    `SELECT notification_email_enabled,
            notification_whatsapp_enabled,
            notification_push_enabled,
            notification_retention_days
     FROM property_settings
     WHERE property_id = $1`,
    [CORE_SEED_IDS.granadaProperty],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Granada property notification settings not found. Run db:seed:dev first.');
  }
  return row;
}

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();

  try {
    await resetNotificationSeedState(client);

    const adminToken = await validationToken(client, 'dev.admin@kostation.test');
    const residentAlphaToken = await validationToken(client, 'dev.resident.alpha@kostation.test');
    const residentBravoToken = await validationToken(client, 'dev.resident.bravo@kostation.test');

    const alphaNotifications = await request<NotificationResponse[]>(
      'GET',
      '/my/notifications?limit=50&offset=0',
      residentAlphaToken,
    );
    assert(
      alphaNotifications.some((notification) => notification.id === CORE_SEED_IDS.devNotifications.invoiceIssued),
      'user cannot see own notification',
    );
    assert(
      !alphaNotifications.some((notification) => notification.id === CORE_SEED_IDS.devNotifications.billingOverdue),
      'user can see another user notification',
    );

    const deniedStatus = await requestDenied(
      'POST',
      `/my/notifications/${CORE_SEED_IDS.devNotifications.billingOverdue}/read`,
      residentAlphaToken,
    );
    assert(deniedStatus === 404, `other user notification read should return 404, got ${deniedStatus}`);

    const unreadBefore = await request<UnreadCountResponse>('GET', '/my/notifications/unread-count', residentAlphaToken);
    assert(unreadBefore.unread_count === 2, `unread count expected 2, got ${unreadBefore.unread_count}`);

    const readNotification = await request<NotificationResponse>(
      'POST',
      `/my/notifications/${CORE_SEED_IDS.devNotifications.invoiceIssued}/read`,
      residentAlphaToken,
      undefined,
      201,
    );
    assert(readNotification.notification_status === 'read', 'mark as read did not set read status');

    const unreadAfterRead = await request<UnreadCountResponse>('GET', '/my/notifications/unread-count', residentAlphaToken);
    assert(unreadAfterRead.unread_count === 1, `unread count after read expected 1, got ${unreadAfterRead.unread_count}`);

    const readAll = await request<{ updatedCount: number }>('POST', '/my/notifications/read-all', residentAlphaToken, undefined, 201);
    assert(readAll.updatedCount === 1, `read all expected to update 1 notification, got ${readAll.updatedCount}`);

    const unreadAfterReadAll = await request<UnreadCountResponse>('GET', '/my/notifications/unread-count', residentAlphaToken);
    assert(unreadAfterReadAll.unread_count === 0, `unread count after read all expected 0, got ${unreadAfterReadAll.unread_count}`);

    const archived = await request<NotificationResponse>(
      'POST',
      `/my/notifications/${CORE_SEED_IDS.devNotifications.vehicleApproved}/archive`,
      residentAlphaToken,
      undefined,
      201,
    );
    assert(archived.notification_status === 'archived', 'archive did not set archived status');

    const preference = await request<PreferenceResponse>('GET', '/my/notification-preferences', residentAlphaToken);
    assert(preference.email_enabled === true, 'preference get did not return email enabled');
    assert(preference.whatsapp_enabled === false, 'preference get did not return WhatsApp disabled');

    const updatedPreference = await request<PreferenceResponse>(
      'PATCH',
      '/my/notification-preferences',
      residentAlphaToken,
      { digest_mode: true, quiet_hours_start: '22:00', quiet_hours_end: '06:00' },
    );
    assert(updatedPreference.digest_mode === true, 'preference update did not set digest mode');

    const deliveries = await request<DeliveryResponse[]>(
      'GET',
      `/notifications/deliveries?property_id=${CORE_SEED_IDS.granadaProperty}&limit=50&offset=0`,
      adminToken,
    );
    assert(deliveries.length >= 5, `admin delivery list expected at least 5, got ${deliveries.length}`);
    assert(
      deliveries.every((delivery) => !delivery.recipient_address && !delivery.content_snapshot && !delivery.provider_secret),
      'delivery response exposes raw recipient address, content snapshot, or provider secret',
    );
    assert(
      deliveries.some((delivery) => delivery.recipient_address_masked && delivery.recipient_address_masked !== 'dev.resident.alpha@kostation.test'),
      'delivery response did not expose a masked recipient address',
    );

    const deadLetters = await request<DeliveryResponse[]>(
      'GET',
      `/notifications/dead-letter?property_id=${CORE_SEED_IDS.granadaProperty}&limit=50&offset=0`,
      adminToken,
    );
    assert(
      deadLetters.some((delivery) => delivery.delivery_status === 'dead_lettered'),
      'admin dead-letter list did not include dead-lettered delivery',
    );

    const deliveryDetail = await request<DeliveryResponse>(
      'GET',
      `/notifications/deliveries/${CORE_SEED_IDS.devNotificationDeliveries.deadLetterEmail}`,
      adminToken,
    );
    assert(!deliveryDetail.recipient_address, 'delivery detail exposes raw recipient address');
    assert(!deliveryDetail.content_snapshot, 'delivery detail exposes content snapshot');

    const settings = await notificationSettings(client);
    assert(settings.notification_retention_days === 90, 'retention settings should be 90 days');
    assert(settings.notification_email_enabled === true, 'Brevo/email should be enabled by default');
    assert(settings.notification_whatsapp_enabled === false, 'Fonnte/WhatsApp should be disabled by default');
    assert(settings.notification_push_enabled === false, 'push should be disabled by default');

    await requestDenied('GET', '/notifications/deliveries', residentBravoToken);

    console.log('Notification workflow validation passed.');
    console.log(`own_notifications_seen: ${alphaNotifications.length}`);
    console.log(`delivery_records_seen: ${deliveries.length}`);
    console.log(`dead_letter_records_seen: ${deadLetters.length}`);
    console.log(`retention_days: ${settings.notification_retention_days}`);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
