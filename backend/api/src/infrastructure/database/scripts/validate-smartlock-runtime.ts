import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import Redis from 'ioredis';
import { Pool, PoolClient } from 'pg';
import { databaseConfigFromEnv } from './database-url';
import { CORE_SEED_IDS, DEV_SMART_LOCK_GATEWAY_SEEDS } from '../seeds/core-seed.data';
import { RedisService } from '../../redis/redis.service';
import { TuyaSmartLockGateway } from '../../../modules/smart-lock/gateways/tuya-smart-lock.gateway';
import { TuyaSmartLockProvider } from '../../../modules/smart-lock/runtime/providers/tuya-smart-lock.provider';
import { SmartLockTuyaConfigService } from '../../../modules/smart-lock/runtime/providers/tuya/smart-lock-tuya-config.service';
import { TuyaHttpClientService } from '../../../modules/smart-lock/runtime/providers/tuya/tuya-http-client.service';
import { SmartLockFailoverService } from '../../../modules/smart-lock/runtime/services/smart-lock-failover.service';
import { SmartLockProviderRegistryService } from '../../../modules/smart-lock/runtime/services/smart-lock-provider-registry.service';
import { SmartLockRetryPolicyService } from '../../../modules/smart-lock/runtime/services/smart-lock-retry-policy.service';
import { SmartLockSecretResolutionService } from '../../../modules/smart-lock/runtime/services/smart-lock-secret-resolution.service';
import { SmartLockTokenCacheService } from '../../../modules/smart-lock/runtime/services/smart-lock-token-cache.service';
import {
  SmartLockGatewayCredentialRecord,
  SmartLockGatewayRecord,
  SmartLockProviderContext,
  SmartLockResolvedGatewayContext,
} from '../../../modules/smart-lock/runtime/types/smart-lock-runtime.types';

loadEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend/api/.env'),
    resolve(__dirname, '../../../../.env'),
    resolve(__dirname, '../../../.env'),
  ].find((path) => existsSync(path)),
});

type CheckStatus = 'PASS' | 'FAIL';

type CheckResult = {
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
};

type NameRow = {
  name: string;
};

type CountRow = {
  count: string;
};

type SmokeContext = {
  propertyId: string;
  roomId: string;
  residentId: string;
  actorUserId: string;
};

const requiredTables = [
  'smart_lock_devices',
  'smart_lock_access_grants',
  'smart_lock_credentials',
  'smart_lock_access_logs',
  'smart_lock_restrictions',
  'smart_lock_alerts',
  'smart_lock_gateways',
  'smart_lock_gateway_credentials',
  'smart_lock_device_gateways',
  'smart_lock_gateway_health',
];

const requiredConstraints = [
  'smart_lock_devices_tuya_device_id_unique',
  'smart_lock_devices_device_status_check',
  'smart_lock_access_grants_type_check',
  'smart_lock_credentials_type_check',
  'smart_lock_access_logs_action_type_check',
  'smart_lock_restrictions_status_check',
  'smart_lock_alerts_status_check',
  'smart_lock_gateways_provider_type_check',
  'smart_lock_gateways_status_check',
  'smart_lock_gateway_credentials_status_check',
  'smart_lock_device_gateways_status_check',
  'smart_lock_gateway_health_status_check',
];

const requiredIndexes = [
  'idx_sld_room_active_unique',
  'idx_slag_resident_device_active_unique',
  'idx_slal_property_action_occurred',
  'idx_slr_resident_active',
  'idx_sla_property_severity',
  'idx_slg_property_code_unique',
  'idx_slg_provider_status',
  'idx_slgc_gateway_ref_version_unique',
  'idx_sldg_device_active_unique',
  'idx_slgh_status_checked',
];

const requiredPermissions = [
  'smart_lock.read',
  'smart_lock.manage',
  'smart_lock.view',
  'smart_lock.command',
  'smart_lock.gateway.read',
  'smart_lock.gateway.manage',
  'smart_lock.gateway.credentials.rotate',
  'smart_lock.device.onboard',
  'smart_lock.device.migrate',
];

async function main(): Promise<void> {
  const pool = new Pool(databaseConfigFromEnv());
  const client = await pool.connect();
  const results: CheckResult[] = [];
  let redis: Redis | null = null;

  try {
    await appendDatabaseChecks(client, results);
    await appendPermissionChecks(client, results);
    await appendRuntimeChecks(results);
    redis = createRedisClient();
    await appendRedisChecks(redis, results);
    await appendHealthChecks(client, redis, results);
    await appendSmokeChecks(client, results);
  } finally {
    client.release();
    await pool.end();
    redis?.disconnect();
  }

  printResults(results);

  const failed = results.filter((result) => result.status === 'FAIL');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function appendDatabaseChecks(client: PoolClient, results: CheckResult[]): Promise<void> {
  await record(results, 'Database', 'migration files 009 and 010 are present', () => {
    assert(existsSync(resolve(process.cwd(), 'src/infrastructure/database/migrations/009_smart_lock.sql')), '009 missing');
    assert(existsSync(resolve(process.cwd(), 'src/infrastructure/database/migrations/010_smart_lock_runtime.sql')), '010 missing');
    return 'migration files found';
  });

  await record(results, 'Database', 'required Smart Lock tables are available', async () => {
    const found = await names(
      client,
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [requiredTables],
    );
    const missing = requiredTables.filter((table) => !found.includes(table));
    assert(missing.length === 0, `missing tables: ${missing.join(', ')}`);
    return `${found.length}/${requiredTables.length} tables`;
  });

  await record(results, 'Database', 'required check/unique constraints are available', async () => {
    const found = await names(
      client,
      `SELECT conname AS name
       FROM pg_constraint
       WHERE conname = ANY($1::text[])`,
      [requiredConstraints],
    );
    const missing = requiredConstraints.filter((constraint) => !found.includes(constraint));
    assert(missing.length === 0, `missing constraints: ${missing.join(', ')}`);
    return `${found.length}/${requiredConstraints.length} constraints`;
  });

  await record(results, 'Database', 'foreign keys exist on Smart Lock tables', async () => {
    const row = await count(
      client,
      `SELECT count(*)
       FROM pg_constraint
       WHERE contype = 'f'
         AND conrelid::regclass::text = ANY($1::text[])`,
      [requiredTables],
    );
    assert(row >= 20, `expected at least 20 FK constraints, got ${row}`);
    return `${row} FK constraints`;
  });

  await record(results, 'Database', 'required indexes are available', async () => {
    const found = await names(
      client,
      `SELECT indexname AS name
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      [requiredIndexes],
    );
    const missing = requiredIndexes.filter((index) => !found.includes(index));
    assert(missing.length === 0, `missing indexes: ${missing.join(', ')}`);
    return `${found.length}/${requiredIndexes.length} indexes`;
  });

  await record(results, 'Database', 'partial unique indexes enforce active-only mappings', async () => {
    const definitions = await client.query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      [['idx_sld_room_active_unique', 'idx_sldg_device_active_unique']],
    );
    const text = definitions.rows.map((row) => row.indexdef).join('\n').toLowerCase();
    assert(text.includes('where (device_status <>'), 'room active-device partial index missing WHERE clause');
    assert(text.includes("mapping_status = 'active'"), 'device gateway active-mapping partial index missing WHERE clause');
    return 'active-only partial uniqueness present';
  });

  await record(results, 'Database', 'runtime tables contain no plaintext secret columns', async () => {
    const forbidden = await names(
      client,
      `SELECT column_name AS name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND column_name = ANY($2::text[])`,
      [
        ['smart_lock_gateways', 'smart_lock_gateway_credentials', 'smart_lock_device_gateways', 'smart_lock_gateway_health'],
        ['access_secret', 'client_secret', 'secret_value', 'password', 'token'],
      ],
    );
    assert(forbidden.length === 0, `forbidden columns: ${forbidden.join(', ')}`);
    return 'no plaintext secret columns';
  });
}

async function appendPermissionChecks(client: PoolClient, results: CheckResult[]): Promise<void> {
  await record(results, 'Permission', 'all Smart Lock permissions are seeded', async () => {
    const found = await names(client, 'SELECT code AS name FROM permissions WHERE code = ANY($1::text[])', [requiredPermissions]);
    const missing = requiredPermissions.filter((permission) => !found.includes(permission));
    assert(missing.length === 0, `missing permissions: ${missing.join(', ')}`);
    return `${found.length}/${requiredPermissions.length} permissions`;
  });

  await record(results, 'Permission', 'owner and manager hold gateway runtime permissions', async () => {
    const permissionCount = await count(
      client,
      `SELECT count(*)
       FROM role_permissions
       JOIN roles ON roles.id = role_permissions.role_id
       JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE roles.code = ANY($1::text[])
         AND permissions.code = ANY($2::text[])`,
      [
        ['owner', 'manager'],
        ['smart_lock.gateway.read', 'smart_lock.gateway.manage', 'smart_lock.device.onboard', 'smart_lock.device.migrate'],
      ],
    );
    assert(permissionCount === 8, `expected 8 owner/manager gateway grants, got ${permissionCount}`);
    return 'owner/manager gateway grants valid';
  });

  await record(results, 'Permission', 'property_owner and resident have no Smart Lock permissions', async () => {
    const forbidden = await count(
      client,
      `SELECT count(*)
       FROM role_permissions
       JOIN roles ON roles.id = role_permissions.role_id
       JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE roles.code = ANY($1::text[])
         AND permissions.code LIKE 'smart_lock.%'`,
      [['property_owner', 'resident']],
    );
    assert(forbidden === 0, `forbidden Smart Lock grants: ${forbidden}`);
    return 'no property_owner/resident Smart Lock role grants';
  });

  await record(results, 'Permission', 'admin gateway scope is read-only and no command privilege', async () => {
    const forbidden = await names(
      client,
      `SELECT permissions.code AS name
       FROM role_permissions
       JOIN roles ON roles.id = role_permissions.role_id
       JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE roles.code = 'admin'
         AND permissions.code = ANY($1::text[])`,
      [['smart_lock.command', 'smart_lock.gateway.manage', 'smart_lock.gateway.credentials.rotate', 'smart_lock.device.onboard', 'smart_lock.device.migrate']],
    );
    assert(forbidden.length === 0, `admin has forbidden grants: ${forbidden.join(', ')}`);
    return 'admin has no Smart Lock command/gateway mutation grants';
  });

  await record(results, 'Permission', 'property scope assignments exist for owner and dev staff', async () => {
    const assignmentCount = await count(
      client,
      `SELECT count(*)
       FROM user_property_roles
       WHERE property_id = $1
         AND revoked_at IS NULL`,
      [CORE_SEED_IDS.granadaProperty],
    );
    assert(assignmentCount >= 6, `expected scoped assignments, got ${assignmentCount}`);
    return `${assignmentCount} active property role assignments`;
  });
}

async function appendRuntimeChecks(results: CheckResult[]): Promise<void> {
  const gateway = new TuyaSmartLockGateway();
  // Deterministic simulated-mode config: the runtime regression must not depend on local env.
  const simulatedConfig = new ConfigService({
    smartLock: { provider: 'simulated', liveEnabled: false, commandTimeoutMs: 15_000, tuya: {} },
  });
  const tuyaConfig = new SmartLockTuyaConfigService(simulatedConfig);
  const httpClient = new TuyaHttpClientService(tuyaConfig);
  const offlineTokenCache = new SmartLockTokenCacheService({ client: null } as unknown as RedisService);
  const secretResolver = new SmartLockSecretResolutionService(simulatedConfig);
  const provider = new TuyaSmartLockProvider(gateway, tuyaConfig, secretResolver, httpClient, offlineTokenCache);
  const providerRegistry = new SmartLockProviderRegistryService(provider);
  const retryPolicy = new SmartLockRetryPolicyService();
  const failover = new SmartLockFailoverService();

  const gatewayRecord = sampleGatewayRecord();
  const credentialRecord = sampleCredentialRecord(gatewayRecord);
  const providerContext: SmartLockProviderContext = {
    gateway: gatewayRecord,
    providerDeviceId: 'dev-provider-device-runtime-check',
    correlationId: '00000000-0000-4000-8000-000000000000',
    secretRef: secretResolver.resolve(gatewayRecord, credentialRecord),
  };

  await record(results, 'Runtime', 'provider registry resolves Tuya provider skeleton', async () => {
    const resolved = providerRegistry.resolve('tuya');
    assert(resolved.providerType === 'tuya', 'Tuya provider was not resolved');
    const health = await resolved.healthCheck(providerContext);
    assert(health.healthStatus === 'unknown', 'M10F skeleton health should be unknown');
    return `provider=${resolved.providerType}, health=${health.healthStatus}`;
  });

  await record(results, 'Runtime', 'secret resolution returns safe credential reference only', () => {
    const secret = secretResolver.resolve(gatewayRecord, credentialRecord);
    const descriptor = secretResolver.safeDescriptor(secret);
    assert(secret.credentialRef === credentialRecord.credentialRef, 'credential ref not resolved from active credential');
    assert(!Object.keys(descriptor).some((key) => key.includes('secret') || key === 'token'), 'safe descriptor exposes secret-like key');
    return `credential_ref=${descriptor.credential_ref}, version=${descriptor.version}`;
  });

  await record(results, 'Runtime', 'retry policy follows Smart Lock transient failure rules', () => {
    assert(retryPolicy.shouldRetry({ success: false, resultStatus: 'timeout', provider: 'tuya' }), 'timeout should retry');
    assert(retryPolicy.shouldRetry({ success: false, resultStatus: 'device_offline', provider: 'tuya' }), 'device offline should retry');
    assert(
      retryPolicy.shouldRetry({ success: false, resultStatus: 'failed', provider: 'tuya', errorCode: 'RATE_LIMITED' }),
      'rate limited should retry',
    );
    assert(retryPolicy.nextDelayMs(0) === 0 && retryPolicy.nextDelayMs(3) === 120_000, 'retry schedule mismatch');
    return 'timeout/device_offline/rate_limited retryable';
  });

  await record(results, 'Runtime', 'failover foundation refuses unsafe cross-gateway command failover', () => {
    const classification = failover.classify(
      { success: false, resultStatus: 'failed', provider: 'tuya', errorCode: 'ACCOUNT_DOWN' },
      sampleResolvedContext(gatewayRecord),
    );
    assert(classification.canFailover === false, 'device-bound command should not fail over to another gateway');
    assert(classification.reason === 'device_binding_requires_same_gateway', 'unexpected failover reason');
    return classification.reason;
  });

  await record(results, 'Runtime', 'Tuya gateway remains skeleton-only', async () => {
    const result = await gateway.executeCommand('dev-provider-device-runtime-check', 'unlock');
    assert(result.success === false, 'skeleton gateway should not execute real command');
    assert(result.errorCode === 'TUYA_GATEWAY_NOT_IMPLEMENTED', 'unexpected gateway error code');
    return 'no real Tuya API execution';
  });

  // M13C gate checks: provider=tuya with live_enabled=true and NO credentials must stay safe
  // (no network call is made on either path below).
  const tuyaModeConfig = new ConfigService({
    smartLock: { provider: 'tuya', liveEnabled: true, commandTimeoutMs: 15_000, tuya: {} },
  });
  const tuyaModeConfigService = new SmartLockTuyaConfigService(tuyaModeConfig);
  const tuyaModeProvider = new TuyaSmartLockProvider(
    gateway,
    tuyaModeConfigService,
    new SmartLockSecretResolutionService(tuyaModeConfig),
    new TuyaHttpClientService(tuyaModeConfigService),
    offlineTokenCache,
  );

  await record(results, 'Runtime', 'M13C live command gate returns LIVE_COMMAND_DISABLED', async () => {
    const result = await tuyaModeProvider.executeCommand(providerContext, 'unlock');
    assert(result.success === false, 'live command must not succeed in M13C');
    assert(result.errorCode === 'LIVE_COMMAND_DISABLED', 'expected LIVE_COMMAND_DISABLED');
    return 'live unlock disabled even with provider=tuya and live_enabled=true';
  });

  await record(results, 'Runtime', 'M13C tuya mode with missing config reports CONFIG_MISSING safely', async () => {
    const health = await tuyaModeProvider.healthCheck(providerContext);
    assert(health.healthStatus === 'unhealthy', 'missing Tuya config should report unhealthy');
    assert(health.errorCode === 'CONFIG_MISSING', 'expected CONFIG_MISSING');
    return 'CONFIG_MISSING fail-safe without live behavior';
  });
}

async function appendRedisChecks(redis: Redis, results: CheckResult[]): Promise<void> {
  await record(results, 'Runtime', 'Redis connection is available for Smart Lock token cache', async () => {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const response = await redis.ping();
    assert(response === 'PONG', `unexpected Redis ping: ${response}`);
    return 'Redis PONG';
  });

  await record(results, 'Runtime', 'Redis token cache stores, reads, clears, and single-flights refresh', async () => {
    const gatewayId = 'validation-gateway';
    const tokenCache = new SmartLockTokenCacheService({ client: redis } as unknown as RedisService);
    await tokenCache.setToken(gatewayId, 'validation-token', new Date(Date.now() + 60_000));
    const token = await tokenCache.getToken(gatewayId);
    assert(token === 'validation-token', 'token cache read mismatch');
    const firstLock = await tokenCache.acquireRefreshLock(gatewayId, 5);
    const secondLock = await tokenCache.acquireRefreshLock(gatewayId, 5);
    assert(firstLock === true && secondLock === false, 'refresh lock single-flight failed');
    await tokenCache.clearToken(gatewayId);
    await redis.del(`granada:smartlock:gw:${gatewayId}:token-refresh-lock`);
    return 'token cache and refresh lock operational';
  });
}

async function appendHealthChecks(client: PoolClient, redis: Redis, results: CheckResult[]): Promise<void> {
  await record(results, 'Health', 'gateway registry seed is readable', async () => {
    const gatewayCount = await count(
      client,
      `SELECT count(*)
       FROM smart_lock_gateways
       WHERE property_id = $1
         AND id = ANY($2::uuid[])`,
      [CORE_SEED_IDS.granadaProperty, DEV_SMART_LOCK_GATEWAY_SEEDS.map(({ id }) => id)],
    );
    assert(gatewayCount === DEV_SMART_LOCK_GATEWAY_SEEDS.length, `expected dev gateways, got ${gatewayCount}`);
    return `${gatewayCount} dev gateways`;
  });

  await record(results, 'Health', 'gateway health snapshots are readable', async () => {
    const healthCount = await count(
      client,
      `SELECT count(*)
       FROM smart_lock_gateway_health
       WHERE gateway_id = ANY($1::uuid[])
         AND health_status = 'unknown'`,
      [DEV_SMART_LOCK_GATEWAY_SEEDS.map(({ id }) => id)],
    );
    assert(healthCount === DEV_SMART_LOCK_GATEWAY_SEEDS.length, `expected health snapshots, got ${healthCount}`);
    return `${healthCount} health rows`;
  });

  await record(results, 'Health', 'active gateway and credential references are safe', async () => {
    const activeCredentialCount = await count(
      client,
      `SELECT count(*)
       FROM smart_lock_gateways
       JOIN smart_lock_gateway_credentials ON smart_lock_gateway_credentials.gateway_id = smart_lock_gateways.id
       WHERE smart_lock_gateways.property_id = $1
         AND smart_lock_gateways.gateway_status = 'active'
         AND smart_lock_gateway_credentials.credential_status = 'active'
         AND smart_lock_gateway_credentials.credential_ref LIKE 'secret://dev/smart-lock/tuya/%'`,
      [CORE_SEED_IDS.granadaProperty],
    );
    assert(activeCredentialCount >= 1, 'no active safe credential reference found');
    return `${activeCredentialCount} active safe credential reference(s)`;
  });

  await record(results, 'Health', 'Redis runtime connection remains usable after token cache checks', async () => {
    const response = await redis.ping();
    assert(response === 'PONG', `unexpected Redis ping: ${response}`);
    return 'Redis still healthy';
  });
}

async function appendSmokeChecks(client: PoolClient, results: CheckResult[]): Promise<void> {
  await record(results, 'Smoke', 'device registration, mapping, credential, restriction, and audit insert are valid', async () => {
    const context = await smokeContext(client);
    const deviceId = '91000000-0000-4000-8000-000000000001';
    const grantId = '91100000-0000-4000-8000-000000000001';
    const credentialId = '91200000-0000-4000-8000-000000000001';
    const restrictionId = '91300000-0000-4000-8000-000000000001';

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO smart_lock_devices (
           id, property_id, room_id, device_name, tuya_device_id, connection_status,
           lock_state, device_status, battery_percent, commissioned_at
         )
         VALUES ($1, $2, $3, 'Runtime Validation Lock', 'runtime-validation-device', 'online',
           'locked', 'active', 88, now())`,
        [deviceId, context.propertyId, context.roomId],
      );
      await client.query(
        `INSERT INTO smart_lock_device_gateways (
           smart_lock_device_id, gateway_id, provider_device_id, mapping_status, last_verified_at
         )
         VALUES ($1, $2, 'runtime-validation-provider-device', 'active', now())`,
        [deviceId, DEV_SMART_LOCK_GATEWAY_SEEDS[0].id],
      );
      await client.query(
        `INSERT INTO smart_lock_access_grants (
           id, property_id, smart_lock_device_id, resident_id, user_id, grant_type,
           grant_status, grant_purpose, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, 'resident', 'active', 'runtime_validation', $6)`,
        [grantId, context.propertyId, deviceId, context.residentId, context.actorUserId, context.actorUserId],
      );
      await client.query(
        `INSERT INTO smart_lock_credentials (
           id, smart_lock_device_id, access_grant_id, credential_type, credential_status,
           tuya_credential_id, credential_label, pin_display_hash, created_by_user_id
         )
         VALUES ($1, $2, $3, 'pin', 'active', 'runtime-validation-credential',
           'Runtime validation PIN metadata only', 'runtime-validation-hash', $4)`,
        [credentialId, deviceId, grantId, context.actorUserId],
      );
      await client.query(
        `INSERT INTO smart_lock_restrictions (
           id, property_id, smart_lock_device_id, room_id, resident_id, reason_type,
           reason_description, restriction_status, requested_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, 'manual_admin',
           'Runtime validation restriction smoke record', 'pending_approval', $6)`,
        [restrictionId, context.propertyId, deviceId, context.roomId, context.residentId, context.actorUserId],
      );
      await client.query(
        `INSERT INTO smart_lock_access_logs (
           property_id, smart_lock_device_id, room_id, resident_id, actor_user_id,
           action_type, source, trigger, result_status, credential_type_used,
           correlation_id, metadata
         )
         VALUES ($1, $2, $3, $4, $5, 'sync_status', 'system', 'manual', 'success',
           NULL, gen_random_uuid(), $6::jsonb)`,
        [
          context.propertyId,
          deviceId,
          context.roomId,
          context.residentId,
          context.actorUserId,
          JSON.stringify({ runtime_validation: true, secret_material: false }),
        ],
      );
      await client.query('ROLLBACK');
      return 'smoke transaction succeeded and rolled back';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function smokeContext(client: PoolClient): Promise<SmokeContext> {
  const result = await client.query<SmokeContext>(
    `SELECT rooms.property_id AS "propertyId",
            rooms.id AS "roomId",
            residents.id AS "residentId",
            users.id AS "actorUserId"
     FROM occupancies
     JOIN rooms ON rooms.id = occupancies.room_id
     JOIN residents ON residents.id = occupancies.resident_id
     JOIN users ON users.id = residents.user_id
     WHERE occupancies.property_id = $1
       AND occupancies.occupancy_status = 'active'
     LIMIT 1`,
    [CORE_SEED_IDS.granadaProperty],
  );
  const row = result.rows[0];
  assert(row, 'no active dev occupancy found; run db:seed:dev first');
  return row;
}

async function record(
  results: CheckResult[],
  group: string,
  name: string,
  action: () => Promise<string> | string,
): Promise<void> {
  try {
    const detail = await action();
    results.push({ group, name, status: 'PASS', detail });
  } catch (error) {
    results.push({ group, name, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
  }
}

function printResults(results: CheckResult[]): void {
  const groups = [...new Set(results.map((result) => result.group))];
  for (const group of groups) {
    console.log(`\n[${group}]`);
    for (const result of results.filter((item) => item.group === group)) {
      console.log(`${result.status} ${result.name} - ${result.detail}`);
    }
  }

  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;
  console.log(`\nSmart Lock runtime validation summary: PASS=${passed} FAIL=${failed}`);
}

function createRedisClient(): Redis {
  const keyPrefix = process.env.REDIS_KEY_PREFIX ?? 'granada:';
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url, { keyPrefix, lazyConnect: true });
  }

  return new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    keyPrefix,
    lazyConnect: true,
  });
}

async function names(client: PoolClient, sql: string, params: unknown[] = []): Promise<string[]> {
  const result = await client.query<NameRow>(sql, params);
  return result.rows.map((row) => row.name);
}

async function count(client: PoolClient, sql: string, params: unknown[] = []): Promise<number> {
  const result = await client.query<CountRow>(sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sampleGatewayRecord(): SmartLockGatewayRecord {
  return {
    id: DEV_SMART_LOCK_GATEWAY_SEEDS[0].id,
    propertyId: CORE_SEED_IDS.granadaProperty,
    providerType: 'tuya',
    gatewayCode: DEV_SMART_LOCK_GATEWAY_SEEDS[0].gatewayCode,
    displayName: DEV_SMART_LOCK_GATEWAY_SEEDS[0].displayName,
    gatewayStatus: 'active',
    priority: 10,
    weight: 1,
    capacityLimit: 120,
    capacityUsed: 0,
    region: 'id',
    credentialRef: DEV_SMART_LOCK_GATEWAY_SEEDS[0].credentialRef,
    capabilities: DEV_SMART_LOCK_GATEWAY_SEEDS[0].capabilities,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function sampleCredentialRecord(gateway: SmartLockGatewayRecord): SmartLockGatewayCredentialRecord {
  return {
    id: DEV_SMART_LOCK_GATEWAY_SEEDS[0].credentialId,
    gatewayId: gateway.id,
    credentialRef: DEV_SMART_LOCK_GATEWAY_SEEDS[0].credentialRef,
    credentialStatus: 'active',
    keyId: 'gw-grd-a',
    version: DEV_SMART_LOCK_GATEWAY_SEEDS[0].credentialVersion,
    metadata: { seed: 'development', real_credentials: false },
    activatedAt: new Date(),
    rotatedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function sampleResolvedContext(gateway: SmartLockGatewayRecord): SmartLockResolvedGatewayContext {
  return {
    gateway,
    providerDeviceId: 'dev-provider-device-runtime-check',
    mapping: null,
    resolutionSource: 'legacy_device_id',
  };
}

void main();
