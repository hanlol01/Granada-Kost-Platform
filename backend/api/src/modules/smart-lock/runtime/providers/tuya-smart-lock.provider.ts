import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { SmartLockAccessAction } from '../../types/smart-lock.types';
import {
  SmartLockDiagnosticCapability,
  SmartLockDiagnosticSection,
  SmartLockDiagnosticStatusEntry,
  SmartLockProvider,
  SmartLockProviderContext,
  SmartLockProviderHealthResult,
  SmartLockReadOnlyDiagnosticResult,
  SmartLockReadOnlySyncData,
} from '../types/smart-lock-runtime.types';
import {
  SmartLockSecretResolutionService,
  SmartLockTuyaResolvedCredentials,
} from '../services/smart-lock-secret-resolution.service';
import { SmartLockTokenCacheService } from '../services/smart-lock-token-cache.service';
import { SmartLockTuyaConfigService } from './tuya/smart-lock-tuya-config.service';
import {
  TuyaClientCredentials,
  TuyaClientFailure,
  TuyaClientResponse,
  TuyaHttpClientService,
} from './tuya/tuya-http-client.service';
import type { SmartLockProviderErrorCode } from './tuya/tuya-error-normalization';

const TOKEN_REFRESH_AHEAD_MS = 60_000;
const SENSITIVE_KEY_PATTERN = /(secret|token|ticket|password|passwd|pwd|pin|local_key|access_key|refresh|credential)/i;
const TUYA_UNLOCK_PATHS = {
  passwordTicket: (deviceId: string) => `/v1.0/smart-lock/devices/${deviceId}/password-ticket`,
  doorOperate: (deviceId: string) => `/v1.0/smart-lock/devices/${deviceId}/password-free/door-operate`,
  legacyOpenDoor: (deviceId: string) => `/v1.0/devices/${deviceId}/door-lock/password-free/open-door`,
} as const;

type TuyaCommandMetadata = Record<string, string | number | boolean | undefined>;

/**
 * Tuya Smart Lock provider.
 *
 * - SMART_LOCK_PROVIDER=simulated (default): returns normalized skipped read-only sync
 *   and disabled command results without touching the legacy skeleton gateway.
 * - SMART_LOCK_PROVIDER=tuya: supports read-only healthCheck, fixed allow-listed
 *   diagnostics, M13E read-only sync, and M13F-C2 live remote unlock transport only
 *   when SMART_LOCK_LIVE_ENABLED=true and the command guard has already passed.
 * - Remote lock, temporary PIN, and raw API tester flows remain unavailable.
 *
 * Raw Tuya payloads never leave this provider; results are normalized (M13B freeze, Sections 3/12).
 */
@Injectable()
export class TuyaSmartLockProvider implements SmartLockProvider {
  readonly providerType = 'tuya' as const;

  constructor(
    private readonly tuyaConfig: SmartLockTuyaConfigService,
    private readonly secrets: SmartLockSecretResolutionService,
    private readonly httpClient: TuyaHttpClientService,
    private readonly tokenCache: SmartLockTokenCacheService,
  ) {}

  async healthCheck(context: SmartLockProviderContext): Promise<SmartLockProviderHealthResult> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return {
        healthStatus: 'unknown',
        errorCode: 'TUYA_PROVIDER_SKELETON',
        errorMessage: 'SMART_LOCK_PROVIDER=simulated; live Tuya health check is inactive.',
        metadata: { provider: this.providerType, simulated: true },
      };
    }

    const started = Date.now();
    const credentials = this.secrets.resolveTuyaCredentials(context.secretRef);
    const baseUrl = this.tuyaConfig.resolveBaseUrl();
    if (!credentials || !baseUrl) {
      const missing: string[] = [];
      if (!credentials) {
        missing.push('TUYA_CLIENT_ID/TUYA_CLIENT_SECRET (no resolvable credential source)');
      }
      if (!baseUrl) {
        missing.push('TUYA_REGION or TUYA_BASE_URL');
      }
      return {
        healthStatus: 'unhealthy',
        errorCode: 'CONFIG_MISSING',
        errorMessage: `Tuya provider configuration incomplete: ${missing.join('; ')}.`,
        latencyMs: Date.now() - started,
        metadata: { provider: this.providerType, simulated: false, missing },
      };
    }

    const token = await this.acquireToken(context.gateway.id, baseUrl, credentials);
    if (!token.ok) {
      return {
        healthStatus: 'unhealthy',
        errorCode: token.errorCode,
        errorMessage: token.errorMessage,
        latencyMs: Date.now() - started,
        metadata: {
          provider: this.providerType,
          simulated: false,
          tokenCheck: 'failed',
          credentialSource: credentials.source,
        },
      };
    }

    // Optional lightweight read-only device check. Prefers the resolved provider device id;
    // falls back to the diagnostic-only TUYA_DEVICE_ID_TEST (local/site test only). Device ids
    // are never echoed into health metadata.
    const deviceId = context.providerDeviceId?.trim() || this.tuyaConfig.deviceIdTest;
    let deviceCheck = 'skipped';
    if (deviceId) {
      const deviceRead = await this.signedGetWithTokenRetry(
        context.gateway.id,
        baseUrl,
        credentials,
        `/v1.0/devices/${encodeURIComponent(deviceId)}`,
      );
      if (!deviceRead.ok) {
        return {
          healthStatus: 'degraded',
          errorCode: deviceRead.errorCode,
          errorMessage: 'Tuya token grant succeeded but the device read failed.',
          latencyMs: Date.now() - started,
          metadata: {
            provider: this.providerType,
            simulated: false,
            tokenCheck: 'ok',
            deviceCheck: deviceRead.errorCode,
            credentialSource: credentials.source,
          },
        };
      }
      deviceCheck = 'ok';
    }

    return {
      healthStatus: 'healthy',
      latencyMs: Date.now() - started,
      metadata: {
        provider: this.providerType,
        simulated: false,
        tokenCheck: 'ok',
        deviceCheck,
        credentialSource: credentials.source,
      },
    };
  }

  async readDiagnostics(context: SmartLockProviderContext): Promise<SmartLockReadOnlyDiagnosticResult> {
    const timestamp = new Date().toISOString();
    if (!this.tuyaConfig.isTuyaSelected()) {
      return this.skippedDiagnostics(
        context,
        timestamp,
        'SMART_LOCK_PROVIDER=simulated; live Tuya diagnostics are inactive.',
      );
    }

    const started = Date.now();
    const providerDeviceId = context.providerDeviceId?.trim();
    if (!providerDeviceId) {
      return this.failedDiagnostics(context, timestamp, {
        resultStatus: 'failed',
        operation: 'provider_health',
        errorCode: 'DEVICE_NOT_MAPPED',
        errorMessage: 'Smart lock device has no mapped provider device id.',
        latencyMs: Date.now() - started,
        data: { healthStatus: 'unhealthy', tokenCheck: 'skipped' },
      });
    }

    const credentials = this.secrets.resolveTuyaCredentials(context.secretRef);
    const baseUrl = this.tuyaConfig.resolveBaseUrl();
    if (!credentials || !baseUrl) {
      const missing: string[] = [];
      if (!credentials) {
        missing.push('TUYA_CLIENT_ID/TUYA_CLIENT_SECRET');
      }
      if (!baseUrl) {
        missing.push('TUYA_REGION or TUYA_BASE_URL');
      }
      return this.failedDiagnostics(context, timestamp, {
        resultStatus: 'failed',
        operation: 'provider_health',
        errorCode: 'CONFIG_MISSING',
        errorMessage: `Tuya provider configuration incomplete: ${missing.join('; ')}.`,
        latencyMs: Date.now() - started,
        data: { healthStatus: 'unhealthy', tokenCheck: 'skipped' },
      });
    }

    const token = await this.acquireToken(context.gateway.id, baseUrl, credentials);
    if (!token.ok) {
      return this.failedDiagnostics(context, timestamp, {
        ...this.failureSection('provider_health', token),
        data: { healthStatus: 'unhealthy', tokenCheck: 'failed', credentialSource: credentials.source },
      });
    }

    const health: SmartLockDiagnosticSection<{
      healthStatus: 'healthy';
      tokenCheck: 'ok';
      credentialSource: SmartLockTuyaResolvedCredentials['source'];
    }> = {
      resultStatus: 'success',
      operation: 'provider_health',
      data: { healthStatus: 'healthy', tokenCheck: 'ok', credentialSource: credentials.source },
      latencyMs: token.latencyMs,
    };

    const encodedDeviceId = encodeURIComponent(providerDeviceId);
    const metadata = await this.readSection(
      context.gateway.id,
      baseUrl,
      credentials,
      `/v1.0/devices/${encodedDeviceId}`,
      'device_metadata',
      'tuya_v1',
      normalizeMetadata,
    );
    const status = await this.readSection(
      context.gateway.id,
      baseUrl,
      credentials,
      `/v1.0/devices/${encodedDeviceId}/status`,
      'device_status',
      'tuya_v1',
      (payload) => ({ values: normalizeStatusValues(payload) }),
    );
    const functions = await this.readSection(
      context.gateway.id,
      baseUrl,
      credentials,
      `/v1.0/devices/${encodedDeviceId}/functions`,
      'device_functions',
      'tuya_v1',
      (payload) => ({ capabilities: normalizeCapabilities(payload) }),
    );
    const specifications = await this.readSpecifications(context.gateway.id, baseUrl, credentials, encodedDeviceId);

    return this.diagnosticsResult(context, timestamp, health, { metadata, status, functions, specifications });
  }

  async syncDeviceStatus(context: SmartLockProviderContext): Promise<SmartLockGatewayResult> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return simulatedReadOnlySyncResult(context);
    }

    const diagnostics = await this.readDiagnostics(context);
    const data = toReadOnlySyncData(diagnostics);
    if (diagnostics.resultStatus === 'success' || diagnostics.resultStatus === 'partial') {
      return {
        success: true,
        resultStatus: 'success',
        provider: 'tuya',
        data,
      };
    }

    const errorCode = firstDiagnosticErrorCode(diagnostics) ?? 'UNKNOWN_PROVIDER_ERROR';
    return {
      success: false,
      resultStatus: toGatewayResultStatus(diagnostics),
      provider: 'tuya',
      errorCode,
      errorMessage: safeSyncErrorMessage(errorCode),
      data,
    };
  }

  async executeCommand(context: SmartLockProviderContext, action: SmartLockAccessAction): Promise<SmartLockGatewayResult> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return this.liveCommandDisabled('simulated');
    }
    if (!this.tuyaConfig.liveEnabled) {
      return this.liveCommandDisabled('tuya');
    }
    if (action !== 'remote_unlock' && action !== 'emergency_unlock') {
      return this.commandFailure(
        'UNSUPPORTED_CAPABILITY',
        'Only live remote unlock is enabled for Tuya in M13F-C2.',
        'failed',
        undefined,
        { commandSupported: false },
      );
    }

    const started = Date.now();
    const providerDeviceId = context.providerDeviceId?.trim();
    if (!providerDeviceId) {
      return this.commandFailure(
        'DEVICE_NOT_MAPPED',
        'Smart lock device has no mapped provider device id.',
        'failed',
        started,
        { ticketRequested: false, doorOperateAttempted: false, legacyFallbackAttempted: false },
      );
    }

    const credentials = this.secrets.resolveTuyaCredentials(context.secretRef);
    const baseUrl = this.tuyaConfig.resolveBaseUrl();
    if (!credentials || !baseUrl) {
      return this.commandFailure('CONFIG_MISSING', 'Tuya provider configuration is incomplete.', 'failed', started, {
        ticketRequested: false,
        doorOperateAttempted: false,
        legacyFallbackAttempted: false,
      });
    }

    const encodedDeviceId = encodeURIComponent(providerDeviceId);
    const ticket = await this.signedPostWithTokenRetry<Record<string, unknown>>(
      context.gateway.id,
      baseUrl,
      credentials,
      TUYA_UNLOCK_PATHS.passwordTicket(encodedDeviceId),
      {},
    );
    if (!ticket.ok) {
      return this.commandFailureFromTuya(ticket, started, {
        commandTransport: 'password_ticket',
        ticketRequested: true,
        doorOperateAttempted: false,
        legacyFallbackAttempted: false,
      });
    }

    const ticketId = extractTicketId(ticket.result);
    if (!ticketId) {
      return this.commandFailure('UNKNOWN_PROVIDER_ERROR', 'Tuya unlock ticket response was incomplete.', 'failed', started, {
        commandTransport: 'password_ticket',
        ticketRequested: true,
        doorOperateAttempted: false,
        legacyFallbackAttempted: false,
      });
    }

    const operate = await this.signedPostWithTokenRetry<unknown>(
      context.gateway.id,
      baseUrl,
      credentials,
      TUYA_UNLOCK_PATHS.doorOperate(encodedDeviceId),
      { ticket_id: ticketId, open: true },
    );
    if (operate.ok) {
      return this.commandSuccess(started, {
        commandTransport: 'password_free_door_operate',
        ticketRequested: true,
        doorOperateAttempted: true,
        legacyFallbackAttempted: false,
      });
    }

    if (shouldAttemptLegacyUnlockFallback(operate)) {
      const legacy = await this.signedPostWithTokenRetry<unknown>(
        context.gateway.id,
        baseUrl,
        credentials,
        TUYA_UNLOCK_PATHS.legacyOpenDoor(encodedDeviceId),
        {},
      );
      if (legacy.ok) {
        return this.commandSuccess(started, {
          commandTransport: 'legacy_password_free_open_door',
          ticketRequested: true,
          doorOperateAttempted: true,
          legacyFallbackAttempted: true,
        });
      }
      return this.commandFailureFromTuya(legacy, started, {
        commandTransport: 'legacy_password_free_open_door',
        ticketRequested: true,
        doorOperateAttempted: true,
        legacyFallbackAttempted: true,
      });
    }

    return this.commandFailureFromTuya(operate, started, {
      commandTransport: 'password_free_door_operate',
      ticketRequested: true,
      doorOperateAttempted: true,
      legacyFallbackAttempted: false,
    });
  }

  private async readSection<TData>(
    gatewayId: string,
    baseUrl: string,
    credentials: SmartLockTuyaResolvedCredentials,
    path: string,
    operation: SmartLockDiagnosticSection['operation'],
    source: NonNullable<SmartLockDiagnosticSection['source']>,
    normalize: (payload: unknown) => TData,
  ): Promise<SmartLockDiagnosticSection<TData>> {
    const result = await this.signedGetWithTokenRetry<unknown>(gatewayId, baseUrl, credentials, path);
    if (!result.ok) {
      return this.failureSection(operation, result, source);
    }
    return {
      resultStatus: 'success',
      operation,
      source,
      data: normalize(result.result),
      latencyMs: result.latencyMs,
    };
  }

  private async readSpecifications(
    gatewayId: string,
    baseUrl: string,
    credentials: SmartLockTuyaResolvedCredentials,
    encodedDeviceId: string,
  ): Promise<SmartLockDiagnosticSection<{ capabilities: SmartLockDiagnosticCapability[] }>> {
    const primary = await this.readSection(
      gatewayId,
      baseUrl,
      credentials,
      `/v1.0/devices/${encodedDeviceId}/specifications`,
      'device_specifications',
      'tuya_v1',
      (payload) => ({ capabilities: normalizeCapabilities(payload) }),
    );
    if (primary.resultStatus === 'success') {
      return primary;
    }
    const fallback = await this.readSection(
      gatewayId,
      baseUrl,
      credentials,
      `/v1.2/iot-03/devices/${encodedDeviceId}/specification`,
      'device_specifications',
      'tuya_iot_03_fallback',
      (payload) => ({ capabilities: normalizeCapabilities(payload) }),
    );
    return fallback.resultStatus === 'success' ? fallback : primary;
  }

  private failureSection<TData>(
    operation: SmartLockDiagnosticSection['operation'],
    failure: TuyaClientFailure,
    source?: NonNullable<SmartLockDiagnosticSection['source']>,
  ): SmartLockDiagnosticSection<TData> {
    return {
      resultStatus: failure.resultStatus,
      operation,
      source,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      latencyMs: failure.latencyMs,
    };
  }

  private skippedDiagnostics(
    context: SmartLockProviderContext,
    timestamp: string,
    reason: string,
  ): SmartLockReadOnlyDiagnosticResult {
    const health: SmartLockDiagnosticSection<{
      healthStatus: 'unknown';
      tokenCheck: 'skipped';
      deviceCheck: 'skipped';
    }> = {
      resultStatus: 'skipped',
      operation: 'provider_health',
      source: 'simulated',
      data: { healthStatus: 'unknown', tokenCheck: 'skipped', deviceCheck: 'skipped' },
      errorCode: 'NOT_IMPLEMENTED',
      errorMessage: reason,
    };
    return this.diagnosticsResult(context, timestamp, health, {
      metadata: this.skippedSection('device_metadata', reason),
      status: this.skippedSection('device_status', reason),
      functions: this.skippedSection('device_functions', reason),
      specifications: this.skippedSection('device_specifications', reason),
    });
  }

  private failedDiagnostics(
    context: SmartLockProviderContext,
    timestamp: string,
    health: SmartLockDiagnosticSection<{
      healthStatus: 'unhealthy';
      tokenCheck?: string;
      deviceCheck?: string;
      credentialSource?: string;
    }>,
  ): SmartLockReadOnlyDiagnosticResult {
    const reason = health.errorMessage ?? 'Provider diagnostics failed.';
    return this.diagnosticsResult(context, timestamp, health, {
      metadata: this.skippedSection('device_metadata', reason),
      status: this.skippedSection('device_status', reason),
      functions: this.skippedSection('device_functions', reason),
      specifications: this.skippedSection('device_specifications', reason),
    });
  }

  private skippedSection<TData>(
    operation: SmartLockDiagnosticSection['operation'],
    reason: string,
  ): SmartLockDiagnosticSection<TData> {
    return {
      resultStatus: 'skipped',
      operation,
      source: this.tuyaConfig.isTuyaSelected() ? undefined : 'simulated',
      errorCode: 'NOT_IMPLEMENTED',
      errorMessage: reason,
    };
  }

  private diagnosticsResult(
    context: SmartLockProviderContext,
    timestamp: string,
    health: SmartLockDiagnosticSection<{
      healthStatus: 'healthy' | 'unhealthy' | 'unknown';
      tokenCheck?: string;
      deviceCheck?: string;
      credentialSource?: string;
    }>,
    sections: SmartLockReadOnlyDiagnosticResult['sections'],
  ): SmartLockReadOnlyDiagnosticResult {
    const statuses = [
      health.resultStatus,
      sections.metadata.resultStatus,
      sections.status.resultStatus,
      sections.functions.resultStatus,
      sections.specifications.resultStatus,
    ];
    const successCount = statuses.filter((status) => status === 'success').length;
    const failedCount = statuses.filter((status) => ['failed', 'timeout', 'device_offline'].includes(status)).length;
    const skippedCount = statuses.filter((status) => status === 'skipped').length;
    const resultStatus =
      successCount === statuses.length
        ? 'success'
        : successCount > 0
          ? 'partial'
          : failedCount > 0
            ? 'failed'
            : skippedCount === statuses.length
              ? 'skipped'
              : 'failed';

    return {
      provider: this.providerType,
      providerMode: this.tuyaConfig.isTuyaSelected() ? 'tuya' : 'simulated',
      liveCommandEnabled: false,
      resultStatus,
      providerDeviceIdMasked: maskIdentifier(context.providerDeviceId),
      timestamp,
      correlationId: context.correlationId,
      gateway: {
        id: context.gateway.id,
        code: context.gateway.gatewayCode,
        status: context.gateway.gatewayStatus,
        region: context.gateway.region,
      },
      health,
      sections,
    };
  }

  private async acquireToken(
    gatewayId: string,
    baseUrl: string,
    credentials: SmartLockTuyaResolvedCredentials,
  ): Promise<TuyaClientResponse<{ accessToken: string }>> {
    try {
      const cached = await this.tokenCache.getToken(gatewayId);
      if (cached) {
        return { ok: true, result: { accessToken: cached }, latencyMs: 0 };
      }
    } catch {
      // Redis unavailable: fall through to a direct, uncached grant.
    }

    let hasRefreshLock = false;
    try {
      hasRefreshLock = await this.tokenCache.acquireRefreshLock(gatewayId);
    } catch {
      hasRefreshLock = false;
    }

    const grant = await this.httpClient.grantToken(baseUrl, this.asClientCredentials(credentials));
    if (!grant.ok) {
      return grant;
    }

    if (hasRefreshLock) {
      // Refresh-ahead buffer: cache the token slightly shorter than its real lifetime.
      const bufferedExpiry = new Date(grant.result.expiresAt.getTime() - TOKEN_REFRESH_AHEAD_MS);
      if (bufferedExpiry.getTime() > Date.now()) {
        try {
          await this.tokenCache.setToken(gatewayId, grant.result.accessToken, bufferedExpiry);
        } catch {
          // Caching failure is non-fatal for a read-only health check.
        }
      }
    }

    return { ok: true, result: { accessToken: grant.result.accessToken }, latencyMs: grant.latencyMs };
  }

  private async signedGetWithTokenRetry<T>(
    gatewayId: string,
    baseUrl: string,
    credentials: SmartLockTuyaResolvedCredentials,
    path: string,
  ): Promise<TuyaClientResponse<T>> {
    const token = await this.acquireToken(gatewayId, baseUrl, credentials);
    if (!token.ok) {
      return token;
    }
    let response = await this.httpClient.get<T>(baseUrl, this.asClientCredentials(credentials), path, token.result.accessToken);
    if (!response.ok && response.errorCode === 'TOKEN_ERROR') {
      // Retry once with a forced fresh token (M13B freeze, Section 6).
      try {
        await this.tokenCache.clearToken(gatewayId);
      } catch {
        // Non-fatal.
      }
      const fresh = await this.httpClient.grantToken(baseUrl, this.asClientCredentials(credentials));
      if (!fresh.ok) {
        return fresh;
      }
      response = await this.httpClient.get<T>(baseUrl, this.asClientCredentials(credentials), path, fresh.result.accessToken);
    }
    return response;
  }

  private async signedPostWithTokenRetry<T>(
    gatewayId: string,
    baseUrl: string,
    credentials: SmartLockTuyaResolvedCredentials,
    path: string,
    body: Record<string, unknown>,
  ): Promise<TuyaClientResponse<T>> {
    const clientCredentials = this.asClientCredentials(credentials);
    const token = await this.acquireToken(gatewayId, baseUrl, credentials);
    if (!token.ok) {
      return token;
    }
    let response = await this.httpClient.post<T>(baseUrl, clientCredentials, path, body, token.result.accessToken);
    if (!response.ok && response.errorCode === 'TOKEN_ERROR') {
      // Retry once only for token errors. Other command outcomes are not retried blindly.
      try {
        await this.tokenCache.clearToken(gatewayId);
      } catch {
        // Non-fatal.
      }
      const fresh = await this.httpClient.grantToken(baseUrl, clientCredentials);
      if (!fresh.ok) {
        return fresh;
      }
      response = await this.httpClient.post<T>(baseUrl, clientCredentials, path, body, fresh.result.accessToken);
    }
    return response;
  }

  private liveCommandDisabled(provider: 'tuya' | 'simulated'): SmartLockGatewayResult {
    return {
      success: false,
      resultStatus: 'failed',
      provider,
      errorCode: 'LIVE_COMMAND_DISABLED',
      errorMessage: 'Live Smart Lock command is disabled.',
      data: {
        ticketRequested: false,
        doorOperateAttempted: false,
        legacyFallbackAttempted: false,
      },
    };
  }

  private commandSuccess(started: number, data: TuyaCommandMetadata): SmartLockGatewayResult {
    return {
      success: true,
      resultStatus: 'success',
      provider: 'tuya',
      data: {
        ...data,
        providerLatencyMs: Date.now() - started,
      },
    };
  }

  private commandFailure(
    errorCode: SmartLockProviderErrorCode,
    errorMessage: string,
    resultStatus: SmartLockGatewayResult['resultStatus'] = 'failed',
    started?: number,
    data: TuyaCommandMetadata = {},
  ): SmartLockGatewayResult {
    return {
      success: false,
      resultStatus,
      provider: 'tuya',
      errorCode,
      errorMessage,
      data: {
        ...data,
        providerLatencyMs: started === undefined ? undefined : Date.now() - started,
      },
    };
  }

  private commandFailureFromTuya(
    failure: TuyaClientFailure,
    started: number,
    data: TuyaCommandMetadata,
  ): SmartLockGatewayResult {
    return this.commandFailure(failure.errorCode, failure.errorMessage, failure.resultStatus, started, data);
  }

  private asClientCredentials(credentials: SmartLockTuyaResolvedCredentials): TuyaClientCredentials {
    return { clientId: credentials.clientId, clientSecret: credentials.clientSecret };
  }
}

function normalizeMetadata(payload: unknown): Record<string, unknown> {
  const object = asRecord(payload);
  if (!object) {
    return {};
  }
  const fieldMap: Record<string, string[]> = {
    name: ['name', 'device_name'],
    category: ['category', 'category_code'],
    model: ['model', 'model_name'],
    firmware_version: ['firmware_version', 'firmwareVersion', 'version', 'sw_version', 'software_version'],
    product_id: ['product_id', 'productId'],
    product_name: ['product_name', 'productName'],
    online: ['online', 'is_online'],
    active_time: ['active_time', 'activeTime'],
    update_time: ['update_time', 'updateTime'],
    create_time: ['create_time', 'createTime'],
  };
  const safe: Record<string, unknown> = {};
  for (const [targetKey, candidates] of Object.entries(fieldMap)) {
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(object, candidate) && isSafeScalar(object[candidate])) {
        safe[targetKey] = object[candidate];
        break;
      }
    }
  }
  return safe;
}

function normalizeStatusValues(payload: unknown): SmartLockDiagnosticStatusEntry[] {
  return collectCodeObjects(payload)
    .filter((entry) => typeof entry.code === 'string' && Object.prototype.hasOwnProperty.call(entry, 'value'))
    .filter((entry) => !SENSITIVE_KEY_PATTERN.test(String(entry.code)))
    .map((entry) => ({
      code: String(entry.code),
      value: isSafeScalar(entry.value) ? entry.value : null,
    }));
}

function normalizeCapabilities(payload: unknown): SmartLockDiagnosticCapability[] {
  const seen = new Set<string>();
  return collectCodeObjects(payload).reduce<SmartLockDiagnosticCapability[]>((acc, entry) => {
    if (typeof entry.code !== 'string' || SENSITIVE_KEY_PATTERN.test(entry.code) || seen.has(entry.code)) {
      return acc;
    }
    seen.add(entry.code);
    const values = asRecord(entry.values);
    const capability: SmartLockDiagnosticCapability = { code: entry.code };
    if (typeof entry.type === 'string') {
      capability.type = entry.type;
    }
    if (typeof entry.name === 'string') {
      capability.name = entry.name;
    } else if (typeof entry.desc === 'string') {
      capability.name = entry.desc;
    }
    if (values && typeof values.type === 'string') {
      capability.valueType = values.type;
    } else if (typeof entry.value_type === 'string') {
      capability.valueType = entry.value_type;
    }
    acc.push(capability);
    return acc;
  }, []);
}

function toReadOnlySyncData(diagnostics: SmartLockReadOnlyDiagnosticResult): SmartLockReadOnlySyncData {
  const metadata = diagnostics.sections.metadata.data ?? {};
  const statusValues = diagnostics.sections.status.data?.values ?? [];
  const capabilities = uniqueCapabilities([
    ...(diagnostics.sections.functions.data?.capabilities ?? []),
    ...(diagnostics.sections.specifications.data?.capabilities ?? []),
  ]);
  const normalized: SmartLockReadOnlySyncData['normalized'] = {};
  const connectionStatus = normalizeConnectionStatus(metadata, statusValues);
  const lockState = normalizeLockState(statusValues);
  const batteryPercent = normalizeBatteryPercent(statusValues);
  const batteryStatus = normalizeBatteryStatus(statusValues);
  const doorState = normalizeDoorState(statusValues);
  const firmwareVersion = safeString(metadata.firmware_version);
  const model = safeString(metadata.model);

  if (connectionStatus) normalized.connectionStatus = connectionStatus;
  if (lockState) normalized.lockState = lockState;
  if (batteryPercent !== undefined) normalized.batteryPercent = batteryPercent;
  if (batteryStatus) normalized.batteryStatus = batteryStatus;
  if (doorState) normalized.doorState = doorState;
  if (firmwareVersion) normalized.firmwareVersion = firmwareVersion;
  if (model) normalized.model = model;

  return {
    syncPurpose: 'read_only_sync',
    providerMode: diagnostics.providerMode,
    liveCommandEnabled: false,
    syncResultStatus: diagnostics.resultStatus,
    providerDeviceIdMasked: diagnostics.providerDeviceIdMasked,
    healthStatus: normalizeHealthStatus(diagnostics),
    latencyMs: sumLatencies(diagnostics),
    normalized,
    capabilitySummary: summarizeCapabilities(capabilities),
    statusCodes: statusValues.map((entry) => entry.code),
    sectionStatuses: {
      health: diagnostics.health.resultStatus,
      metadata: diagnostics.sections.metadata.resultStatus,
      status: diagnostics.sections.status.resultStatus,
      functions: diagnostics.sections.functions.resultStatus,
      specifications: diagnostics.sections.specifications.resultStatus,
    },
    errorCodes: {
      health: diagnostics.health.errorCode,
      metadata: diagnostics.sections.metadata.errorCode,
      status: diagnostics.sections.status.errorCode,
      functions: diagnostics.sections.functions.errorCode,
      specifications: diagnostics.sections.specifications.errorCode,
    },
  };
}

function simulatedReadOnlySyncResult(context: SmartLockProviderContext): SmartLockGatewayResult<SmartLockReadOnlySyncData> {
  const reason = 'SMART_LOCK_PROVIDER=simulated; live Tuya read-only diagnostic data is unavailable.';
  return {
    success: true,
    resultStatus: 'success',
    provider: 'simulated',
    data: {
      syncPurpose: 'read_only_sync',
      providerMode: 'simulated',
      liveCommandEnabled: false,
      syncResultStatus: 'skipped',
      providerDeviceIdMasked: maskIdentifier(context.providerDeviceId),
      healthStatus: 'healthy',
      reason,
      normalized: {},
      capabilitySummary: {
        supportsRemoteUnlock: null,
        supportsRemoteLock: null,
        supportsTemporaryPin: null,
        supportsBatteryStatus: null,
        supportsDoorStatus: null,
        supportsEventLogs: null,
        observedCodes: [],
      },
      statusCodes: [],
      sectionStatuses: {
        health: 'skipped',
        metadata: 'skipped',
        status: 'skipped',
        functions: 'skipped',
        specifications: 'skipped',
      },
      errorCodes: {},
    },
  };
}

function extractTicketId(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? trimmed : null;
  }
  const object = asRecord(payload);
  if (!object) {
    return null;
  }
  return safeString(object.ticket_id) ?? safeString(object.ticketId) ?? safeString(object.ticket) ?? null;
}

function shouldAttemptLegacyUnlockFallback(failure: TuyaClientFailure): boolean {
  return failure.errorCode === 'INSTRUCTION_NOT_SUPPORTED';
}

function normalizeConnectionStatus(
  metadata: Record<string, unknown>,
  statusValues: SmartLockDiagnosticStatusEntry[],
): SmartLockReadOnlySyncData['normalized']['connectionStatus'] {
  const metadataStatus = toConnectionStatus(metadata.online);
  if (metadataStatus) {
    return metadataStatus;
  }
  const onlineEntry = statusValues.find((entry) => /(^|_)(online|online_state|network_status)(_|$)/i.test(entry.code));
  return onlineEntry ? toConnectionStatus(onlineEntry.value) : undefined;
}

function toConnectionStatus(value: unknown): SmartLockReadOnlySyncData['normalized']['connectionStatus'] {
  if (typeof value === 'boolean') {
    return value ? 'online' : 'offline';
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['online', 'connected', 'true', '1'].includes(normalized)) {
    return 'online';
  }
  if (['offline', 'disconnected', 'false', '0'].includes(normalized)) {
    return 'offline';
  }
  return undefined;
}

function normalizeLockState(
  statusValues: SmartLockDiagnosticStatusEntry[],
): SmartLockReadOnlySyncData['normalized']['lockState'] {
  const entry = statusValues.find((candidate) => {
    const code = candidate.code.toLowerCase();
    if (/(unlock_method|record|alarm|reverse|anti_lock|auto_lock|child)/.test(code)) {
      return false;
    }
    return /(^|_)(lock_state|lock_status|lock_motor_state|door_lock_state|lock)(_|$)/.test(code);
  });
  return entry ? toLockState(entry.value) : undefined;
}

function toLockState(value: unknown): SmartLockReadOnlySyncData['normalized']['lockState'] {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['locked', 'lock', 'closed', 'close'].includes(normalized)) {
    return 'locked';
  }
  if (['unlocked', 'unlock', 'opened', 'open'].includes(normalized)) {
    return 'unlocked';
  }
  return undefined;
}

function normalizeBatteryPercent(statusValues: SmartLockDiagnosticStatusEntry[]): number | undefined {
  for (const entry of statusValues) {
    if (!/(battery|electricity|power)/i.test(entry.code)) {
      continue;
    }
    const parsed = typeof entry.value === 'number' ? entry.value : typeof entry.value === 'string' ? Number(entry.value) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

function normalizeBatteryStatus(statusValues: SmartLockDiagnosticStatusEntry[]): string | undefined {
  const entry = statusValues.find((candidate) => /(battery|electricity|power)/i.test(candidate.code) && typeof candidate.value === 'string');
  return entry ? safeString(entry.value, 64) : undefined;
}

function normalizeDoorState(statusValues: SmartLockDiagnosticStatusEntry[]): SmartLockReadOnlySyncData['normalized']['doorState'] {
  const entry = statusValues.find((candidate) => /(doorcontact|door_contact|door_state|closed_opened)/i.test(candidate.code));
  if (!entry || typeof entry.value !== 'string') {
    return undefined;
  }
  const normalized = entry.value.trim().toLowerCase();
  if (['open', 'opened'].includes(normalized)) {
    return 'open';
  }
  if (['closed', 'close'].includes(normalized)) {
    return 'closed';
  }
  return 'unknown';
}

function summarizeCapabilities(capabilities: SmartLockDiagnosticCapability[]): SmartLockReadOnlySyncData['capabilitySummary'] {
  const observedCodes = capabilities.map((capability) => capability.code);
  return {
    supportsRemoteUnlock: hasCapability(observedCodes, [/^remote_unlock$/, /unlock_remote/, /^unlock$/]),
    supportsRemoteLock: hasCapability(observedCodes, [/^remote_lock$/, /lock_remote/, /^lock$/]),
    supportsTemporaryPin: hasCapability(observedCodes, [/temporary/]),
    supportsBatteryStatus: hasCapability(observedCodes, [/battery/, /electricity/]),
    supportsDoorStatus: hasCapability(observedCodes, [/doorcontact/, /door_contact/, /door_state/, /closed_opened/]),
    supportsEventLogs: hasCapability(observedCodes, [/event/, /log/, /record/, /history/]),
    observedCodes,
  };
}

function uniqueCapabilities(capabilities: SmartLockDiagnosticCapability[]): SmartLockDiagnosticCapability[] {
  const seen = new Set<string>();
  return capabilities.filter((capability) => {
    if (seen.has(capability.code)) {
      return false;
    }
    seen.add(capability.code);
    return true;
  });
}

function hasCapability(codes: string[], patterns: RegExp[]): boolean | null {
  if (codes.length === 0) {
    return null;
  }
  return codes.some((code) => patterns.some((pattern) => pattern.test(code)));
}

function normalizeHealthStatus(diagnostics: SmartLockReadOnlyDiagnosticResult): SmartLockReadOnlySyncData['healthStatus'] {
  const providerHealth = diagnostics.health.data?.healthStatus;
  if (diagnostics.resultStatus === 'success') {
    return providerHealth === 'healthy' || providerHealth === 'degraded' || providerHealth === 'unhealthy' || providerHealth === 'unknown'
      ? providerHealth
      : 'healthy';
  }
  if (diagnostics.resultStatus === 'partial') {
    return 'degraded';
  }
  if (providerHealth === 'healthy' || providerHealth === 'degraded' || providerHealth === 'unhealthy' || providerHealth === 'unknown') {
    return providerHealth;
  }
  return firstDiagnosticErrorCode(diagnostics) === 'DEVICE_OFFLINE' ? 'degraded' : 'unhealthy';
}

function firstDiagnosticErrorCode(diagnostics: SmartLockReadOnlyDiagnosticResult): string | undefined {
  return [
    diagnostics.health.errorCode,
    diagnostics.sections.metadata.errorCode,
    diagnostics.sections.status.errorCode,
    diagnostics.sections.functions.errorCode,
    diagnostics.sections.specifications.errorCode,
  ].find(Boolean);
}

function toGatewayResultStatus(diagnostics: SmartLockReadOnlyDiagnosticResult): SmartLockGatewayResult['resultStatus'] {
  const statuses = [
    diagnostics.health.resultStatus,
    diagnostics.sections.metadata.resultStatus,
    diagnostics.sections.status.resultStatus,
    diagnostics.sections.functions.resultStatus,
    diagnostics.sections.specifications.resultStatus,
  ];
  if (statuses.includes('device_offline') || firstDiagnosticErrorCode(diagnostics) === 'DEVICE_OFFLINE') {
    return 'device_offline';
  }
  if (statuses.includes('timeout')) {
    return 'timeout';
  }
  return 'failed';
}

function safeSyncErrorMessage(errorCode: string): string {
  const messages: Record<string, string> = {
    CONFIG_MISSING: 'Tuya provider configuration is incomplete.',
    SIGNATURE_INVALID: 'Tuya rejected the request signature.',
    PERMISSION_DENIED: 'Tuya denied permission for this read-only sync.',
    API_NOT_SUBSCRIBED: 'A required Tuya API service is not subscribed.',
    DEVICE_OFFLINE: 'The device is offline or sleeping.',
    TOKEN_ERROR: 'Tuya token validation failed.',
    PROVIDER_TIMEOUT: 'The Tuya read-only sync timed out.',
    PROVIDER_CONNECTION_ERROR: 'The Tuya endpoint could not be reached.',
    DEVICE_NOT_MAPPED: 'Smart lock device has no active provider mapping.',
    UNSUPPORTED_CAPABILITY: 'The provider capability is unsupported.',
    UNKNOWN_PROVIDER_ERROR: 'Tuya read-only sync failed.',
  };
  return messages[errorCode] ?? messages.UNKNOWN_PROVIDER_ERROR;
}

function sumLatencies(diagnostics: SmartLockReadOnlyDiagnosticResult): number | undefined {
  const values = [
    diagnostics.health.latencyMs,
    diagnostics.sections.metadata.latencyMs,
    diagnostics.sections.status.latencyMs,
    diagnostics.sections.functions.latencyMs,
    diagnostics.sections.specifications.latencyMs,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function safeString(value: unknown, maxLength = 128): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function collectCodeObjects(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 5) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectCodeObjects(entry, depth + 1));
  }
  const object = asRecord(value);
  if (!object) {
    return [];
  }
  const matches = typeof object.code === 'string' ? [object] : [];
  for (const nested of Object.values(object)) {
    if (Array.isArray(nested) || asRecord(nested)) {
      matches.push(...collectCodeObjects(nested, depth + 1));
    }
  }
  return matches;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isSafeScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function maskIdentifier(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}
