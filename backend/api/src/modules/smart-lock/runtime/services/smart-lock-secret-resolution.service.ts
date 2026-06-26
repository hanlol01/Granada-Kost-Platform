import { Injectable } from '@nestjs/common';
import {
  SmartLockGatewayCredentialRecord,
  SmartLockGatewayRecord,
  SmartLockSecretReference,
} from '../types/smart-lock-runtime.types';

@Injectable()
export class SmartLockSecretResolutionService {
  resolve(gateway: SmartLockGatewayRecord, credential?: SmartLockGatewayCredentialRecord | null): SmartLockSecretReference {
    return {
      credentialRef: credential?.credentialRef ?? gateway.credentialRef,
      keyId: credential?.keyId ?? undefined,
      version: credential?.version,
    };
  }

  safeDescriptor(secretRef: SmartLockSecretReference): Record<string, string | undefined> {
    return {
      credential_ref: secretRef.credentialRef,
      key_id: secretRef.keyId,
      version: secretRef.version,
    };
  }
}
