import { Injectable, Logger } from '@nestjs/common';
import { SmartLockTuyaConfigService } from './smart-lock-tuya-config.service';
import { normalizeTuyaApiError, SmartLockProviderErrorCode } from './tuya-error-normalization';
import { buildStringToSign, createNonce, signRequest } from './tuya-signing.helper';

export type TuyaClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TuyaClientSuccess<T> = { ok: true; result: T; latencyMs: number };

export type TuyaClientFailure = {
  ok: false;
  errorCode: SmartLockProviderErrorCode;
  resultStatus: 'failed' | 'timeout' | 'device_offline';
  errorMessage: string;
  latencyMs: number;
};

export type TuyaClientResponse<T> = TuyaClientSuccess<T> | TuyaClientFailure;

export type TuyaGrantedToken = {
  accessToken: string;
  expiresAt: Date;
};

type TuyaApiEnvelope = {
  success?: unknown;
  code?: number | string;
  msg?: string;
  result?: unknown;
};

/**
 * Backend-only signed HTTP client for the Tuya Cloud Open API (M13C skeleton).
 *
 * Deliberate constraints (M13B freeze, Section 6):
 * - Only provider-chosen GET/POST calls are exposed. No raw signed pass-through
 *   endpoint, no Raw API Tester, and no client-supplied path/payload.
 * - Exact-body signing: the body string is serialized once and the identical bytes are
 *   signed and sent.
 * - Raw Tuya payloads/messages never leave the provider layer; failures are normalized.
 * - Secrets and tokens are never logged; device ids are masked in debug logs.
 */
@Injectable()
export class TuyaHttpClientService {
  private readonly logger = new Logger(TuyaHttpClientService.name);

  constructor(private readonly tuyaConfig: SmartLockTuyaConfigService) {}

  async grantToken(baseUrl: string, credentials: TuyaClientCredentials): Promise<TuyaClientResponse<TuyaGrantedToken>> {
    const response = await this.get<{ access_token?: string; expire_time?: number }>(
      baseUrl,
      credentials,
      '/v1.0/token?grant_type=1',
    );
    if (!response.ok) {
      return response;
    }
    const accessToken = response.result?.access_token;
    if (!accessToken) {
      return {
        ok: false,
        errorCode: 'TOKEN_ERROR',
        resultStatus: 'failed',
        errorMessage: 'Tuya token grant returned no access token.',
        latencyMs: response.latencyMs,
      };
    }
    const expireSeconds =
      typeof response.result?.expire_time === 'number' && response.result.expire_time > 0
        ? response.result.expire_time
        : 3600;
    return {
      ok: true,
      result: { accessToken, expiresAt: new Date(Date.now() + expireSeconds * 1000) },
      latencyMs: response.latencyMs,
    };
  }

  /** Signed read-only GET against a relative Tuya path chosen by the provider layer. */
  async get<T>(
    baseUrl: string,
    credentials: TuyaClientCredentials,
    path: string,
    accessToken?: string,
  ): Promise<TuyaClientResponse<T>> {
    return this.request<T>(baseUrl, credentials, 'GET', path, '', accessToken);
  }

  /** Signed POST against a relative Tuya path and body chosen by the provider layer. */
  async post<T>(
    baseUrl: string,
    credentials: TuyaClientCredentials,
    path: string,
    body: Record<string, unknown>,
    accessToken: string,
  ): Promise<TuyaClientResponse<T>> {
    // Exact-body signing rule: serialize once, sign those bytes, send those bytes.
    const bodyContent = JSON.stringify(body);
    return this.request<T>(baseUrl, credentials, 'POST', path, bodyContent, accessToken);
  }

  private async request<T>(
    baseUrl: string,
    credentials: TuyaClientCredentials,
    method: 'GET' | 'POST',
    path: string,
    bodyContent: string,
    accessToken?: string,
  ): Promise<TuyaClientResponse<T>> {
    const t = Date.now().toString();
    const nonce = createNonce();
    const stringToSign = buildStringToSign(method, bodyContent, path);
    const sign = signRequest({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      accessToken,
      t,
      nonce,
      stringToSign,
    });

    const headers: Record<string, string> = {
      client_id: credentials.clientId,
      sign,
      t,
      nonce,
      sign_method: 'HMAC-SHA256',
    };
    if (accessToken) {
      headers.access_token = accessToken;
    }
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutMs = this.tuyaConfig.commandTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: method === 'POST' ? bodyContent : undefined,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      let envelope: TuyaApiEnvelope;
      try {
        envelope = (await response.json()) as TuyaApiEnvelope;
      } catch {
        this.logger.debug(`Tuya non-JSON response path=${maskPath(path)} http_status=${response.status}`);
        return {
          ok: false,
          errorCode: 'UNKNOWN_PROVIDER_ERROR',
          resultStatus: 'failed',
          errorMessage: `Tuya returned an unreadable response (http_status=${response.status}).`,
          latencyMs,
        };
      }
      if (envelope.success !== true) {
        const normalized = normalizeTuyaApiError(envelope.code, envelope.msg);
        this.logger.debug(`Tuya request failed path=${maskPath(path)} error=${normalized.errorCode}`);
        return { ok: false, ...normalized, latencyMs };
      }
      return { ok: true, result: envelope.result as T, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          ok: false,
          errorCode: 'PROVIDER_TIMEOUT',
          resultStatus: 'timeout',
          errorMessage: `Tuya request timed out after ${timeoutMs} ms.`,
          latencyMs,
        };
      }
      this.logger.debug(`Tuya connection error path=${maskPath(path)}`);
      return {
        ok: false,
        errorCode: 'PROVIDER_CONNECTION_ERROR',
        resultStatus: 'failed',
        errorMessage: 'Could not reach the Tuya endpoint.',
        latencyMs,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Masks device ids and token-like query values before they reach debug logs. */
function maskPath(path: string): string {
  return path.replace(/(\/devices\/)[^/?]+/, '$1***').replace(/(token[^=]*=)[^&]+/gi, '$1***');
}
