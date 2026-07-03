import { Injectable } from '@nestjs/common';
import { SmartLockGatewayResult } from '../../gateways/smart-lock-gateway.interface';
import { TuyaSmartLockGateway } from '../../gateways/tuya-smart-lock.gateway';
import { SmartLockAccessAction } from '../../types/smart-lock.types';
import {
  SmartLockProvider,
  SmartLockProviderContext,
  SmartLockProviderHealthResult,
} from '../types/smart-lock-runtime.types';
import {
  SmartLockSecretResolutionService,
  SmartLockTuyaResolvedCredentials,
} from '../services/smart-lock-secret-resolution.service';
import { SmartLockTokenCacheService } from '../services/smart-lock-token-cache.service';
import { SmartLockTuyaConfigService } from './tuya/smart-lock-tuya-config.service';
import {
  TuyaClientCredentials,
  TuyaClientResponse,
  TuyaHttpClientService,
} from './tuya/tuya-http-client.service';

const TOKEN_REFRESH_AHEAD_MS = 60_000;

/**
 * Tuya Smart Lock provider (M13C skeleton).
 *
 * - SMART_LOCK_PROVIDER=simulated (default): delegates to the existing simulated gateway,
 *   preserving all pre-M13C behavior (rollback path).
 * - SMART_LOCK_PROVIDER=tuya: supports read-only healthCheck only. Live commands are NOT
 *   implemented in M13C and return LIVE_COMMAND_DISABLED even when SMART_LOCK_LIVE_ENABLED=true.
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
    // M13C hard gate: live commands are not implemented regardless of SMART_LOCK_LIVE_ENABLED.
    // A live-intent request is never silently rerouted to the simulated gateway.
    return Promise.resolve({
      success: false,
      resultStatus: 'failed',
      provider: 'tuya',
      errorCode: 'LIVE_COMMAND_DISABLED',
      errorMessage: 'Live Tuya commands are disabled in M13C. Controlled live commands arrive in M13F.',
    });
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
