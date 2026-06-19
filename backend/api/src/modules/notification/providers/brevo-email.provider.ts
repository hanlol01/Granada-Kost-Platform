import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSendRequest, ProviderSendResult } from '../types/notification.types';
import { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class BrevoEmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  readonly providerName = 'brevo' as const;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('notification.brevoApiKey'));
  }

  send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    void request;
    return Promise.resolve({
      success: false,
      errorCode: 'PROVIDER_NOT_IMPLEMENTED',
      errorMessage: 'Brevo provider skeleton is not wired to the real API yet.',
      retryable: false,
    });
  }

  validateRecipient(recipientAddress: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientAddress);
  }
}
