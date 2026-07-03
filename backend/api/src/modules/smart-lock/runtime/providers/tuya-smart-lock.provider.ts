import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { TuyaSmartLockGateway } from '../../gateways/tuya-smart-lock.gateway';
import { SmartLockAccessAction } from '../../types/smart-lock.types';
import {
  SmartLockDiagnosticCapability,
  SmartLockDiagnosticSection,
  SmartLockDiagnosticStatusEntry,
  SmartLockProvider,
  SmartLockProviderContext,
  SmartLockProviderHealthResult,
  SmartLockReadOnlyDiagnosticResult,
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

const TOKEN_REFRESH_AHEAD_MS = 60_000;
const SENSITIVE_KEY_PATTERN = /(secret|token|ticket|password|passwd|pwd|pin|local_key|access_key|refresh|credential)/i;

/**
 * Tuya Smart Lock provider.
 *
 * - SMART_LOCK_PROVIDER=simulated (default): delegates to the existing simulated gateway,
 *   preserving all pre-M13C behavior (rollback path).
 * - SMART_LOCK_PROVIDER=tuya: supports read-only healthCheck and fixed allow-listed
 *   diagnostics. Live commands are NOT implemented in M13D and return LIVE_COMMAND_DISABLED
 *   even when SMART_LOCK_LIVE_ENABLED=true.
 *
 * Raw Tuya payloads never leave this provider; results are normalized (M13B freeze, Sections 3/12).
 */
@Injectable()
export class TuyaSmartLockProvider implements SmartLockProvider {
  readonly providerType = 'tuya' as const;

  constructor(
    private readonly simulatedGateway: TuyaSmartLockGateway,
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

  syncDeviceStatus(context: SmartLockProviderContext): Promise<SmartLockGatewayResult> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return this.simulatedGateway.syncDeviceStatus(context.providerDeviceId);
    }
    return Promise.resolve({
      success: false,
      resultStatus: 'failed',
      provider: 'tuya',
      errorCode: 'NOT_IMPLEMENTED',
      errorMessage: 'Live Tuya read-only sync arrives in M13D/M13E and is not implemented in M13C.',
    });
  }

  executeCommand(context: SmartLockProviderContext, action: SmartLockAccessAction): Promise<SmartLockGatewayResult> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return this.simulatedGateway.executeCommand(context.providerDeviceId, action);
    }
    // M13D hard gate: live commands are not implemented regardless of SMART_LOCK_LIVE_ENABLED.
    // A live-intent request is never silently rerouted to the simulated gateway.
    return Promise.resolve({
      success: false,
      resultStatus: 'failed',
      provider: 'tuya',
      errorCode: 'LIVE_COMMAND_DISABLED',
      errorMessage: 'Live Tuya commands are disabled in M13D. Controlled live commands arrive in M13F.',
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
