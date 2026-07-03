import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SmartLockGatewayCredentialRecord,
  SmartLockGatewayRecord,
  SmartLockSecretReference,
} from '../types/smart-lock-runtime.types';

/**
 * Resolved Tuya API credentials. Only ever produced by SmartLockSecretResolutionService;
 * providers/clients must never read TUYA_CLIENT_SECRET (or any secret) directly.
 */
export type SmartLockTuyaResolvedCredentials = {
  clientId: string;
  clientSecret: string;
  source: 'env_bootstrap';
};

@Injectable()
export class SmartLockSecretResolutionService {
  constructor(private readonly config: ConfigService) {}

  resolve(gateway: SmartLockGatewayRecord, credential?: SmartLockGatewayCredentialRecord | null): SmartLockSecretReference {
    return {
      credentialRef: credential?.credentialRef ?? gateway.credentialRef,
      keyId: credential?.keyId ?? undefined,
      version: credential?.version,
    };
  }

  /**
   * Resolves Tuya API credentials for a gateway secret reference (M13B freeze, Section 5).
   *
   * Source priority:
   *  1) credential_ref -> secret manager / envelope encryption (production path).
   *     Not implemented in M13C; falls through to the env bootstrap source.
   *  2) Env bootstrap source (TUYA_CLIENT_ID / TUYA_CLIENT_SECRET) - LOCAL/SITE-TEST ONLY.
   *
   * Returns null when no source can provide credentials; callers normalize this to CONFIG_MISSING.
   * Values are never logged; use safeDescriptor() and `source` for diagnostics.
   */
  resolveTuyaCredentials(secretRef: SmartLockSecretReference): SmartLockTuyaResolvedCredentials | null {
    void secretRef; // Reserved for credential_ref-based secret manager lookup in a later milestone.
    const clientId = this.trimmedConfig('smartLock.tuya.clientId');
    const clientSecret = this.trimmedConfig('smartLock.tuya.clientSecret');
    if (!clientId || !clientSecret) {
      return null;
    }
    return { clientId, clientSecret, source: 'env_bootstrap' };
  }

  safeDescriptor(secretRef: SmartLockSecretReference): Record<string, string | undefined> {
    return {
      credential_ref: secretRef.credentialRef,
      key_id: secretRef.keyId,
      version: secretRef.version,
    };
  }

  private trimmedConfig(key: string): string | undefined {
    const value = this.config.get<string>(key);
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }
}
