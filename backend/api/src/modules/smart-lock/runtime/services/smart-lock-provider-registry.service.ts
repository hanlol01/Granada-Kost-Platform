import { Injectable } from '@nestjs/common';
import { TuyaSmartLockProvider } from '../providers/tuya-smart-lock.provider';
import { SmartLockProvider, SmartLockProviderType } from '../types/smart-lock-runtime.types';

@Injectable()
export class SmartLockProviderRegistryService {
  constructor(private readonly tuyaProvider: TuyaSmartLockProvider) {}

  resolve(providerType: SmartLockProviderType): SmartLockProvider {
    const providers: Record<SmartLockProviderType, SmartLockProvider> = {
      tuya: this.tuyaProvider,
    };
    return providers[providerType];
  }
}
