import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSendRequest, ProviderSendResult } from '../types/notification.types';
import { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class WebPushProvider implements NotificationProvider {
  readonly channel = 'push' as const;
  readonly providerName = 'web_push' as const;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('notification.pushEnabled') === true;
  }

  send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    void request;
    return Promise.resolve({
      success: false,
      errorCode: 'PROVIDER_DISABLED',
      errorMessage: 'Web Push provider is future-only and disabled by default.',
      retryable: false,
    });
  }

  validateRecipient(recipientAddress: string): boolean {
    return recipientAddress.startsWith('https://');
  }
}
