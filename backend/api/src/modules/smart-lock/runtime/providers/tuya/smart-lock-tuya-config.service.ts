import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SmartLockProviderSelection = 'simulated' | 'tuya';

/**
 * Known Tuya data-center base URLs (M13A Section 2.3; PoC used as reference knowledge only).
 * TUYA_BASE_URL always wins over TUYA_REGION when both are set.
 */
export const TUYA_REGION_BASE_URLS: Record<string, string> = {
  sg: 'https://openapi-sg.iotbing.com',
  us: 'https://openapi.tuyaus.com',
  ueaz: 'https://openapi-ueaz.tuyaus.com',
  eu: 'https://openapi.tuyaeu.com',
  weaz: 'https://openapi-weaz.tuyaeu.com',
  cn: 'https://openapi.tuyacn.com',
};

/**
 * Non-secret Smart Lock provider runtime configuration (M13C).
 * Secrets (TUYA_CLIENT_ID / TUYA_CLIENT_SECRET) are intentionally NOT exposed here;
 * they are resolvable only through SmartLockSecretResolutionService (M13B freeze, Section 5).
 */
@Injectable()
export class SmartLockTuyaConfigService {
  constructor(private readonly config: ConfigService) {}

  get selection(): SmartLockProviderSelection {
    return this.config.get<SmartLockProviderSelection>('smartLock.provider') ?? 'simulated';
  }

  get liveEnabled(): boolean {
    return this.config.get<boolean>('smartLock.liveEnabled') ?? false;
  }

  get commandTimeoutMs(): number {
    const value = this.config.get<number>('smartLock.commandTimeoutMs');
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 15_000;
  }

  /** Optional override consumed by the rate-limit helper in a later milestone (M13F). */
  get maxUnlockPerMinute(): number | undefined {
    return this.config.get<number | undefined>('smartLock.maxUnlockPerMinute');
  }

  get projectId(): string | undefined {
    return this.trimmed('smartLock.tuya.projectId');
  }

  /** Diagnostic-only device id for local/site-test health checks. Never used on production command paths. */
  get deviceIdTest(): string | undefined {
    return this.trimmed('smartLock.tuya.deviceIdTest');
  }

  isTuyaSelected(): boolean {
    return this.selection === 'tuya';
  }

  /**
   * True only when BOTH gates are open (M13B freeze, Section 4).
   * Note: M13C does not implement live commands even when this returns true.
   */
  isLiveCommandAllowed(): boolean {
    return this.isTuyaSelected() && this.liveEnabled;
  }

  resolveBaseUrl(): string | null {
    const explicit = this.trimmed('smartLock.tuya.baseUrl');
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const region = this.trimmed('smartLock.tuya.region')?.toLowerCase();
    if (region && TUYA_REGION_BASE_URLS[region]) {
      return TUYA_REGION_BASE_URLS[region];
    }
    return null;
  }

  private trimmed(key: string): string | undefined {
    const value = this.config.get<string>(key);
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
