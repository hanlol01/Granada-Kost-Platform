import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSendRequest, ProviderSendResult } from '../types/notification.types';
import { NotificationProvider } from './notification-provider.interface';

@Injectable()
export class FonnteWhatsappProvider implements NotificationProvider {
  readonly channel = 'whatsapp' as const;
  readonly providerName = 'fonnte' as const;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('notification.fonnteEnabled') === true && Boolean(this.config.get<string>('notification.fonnteApiKey'));
  }

  send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    void request;
    return Promise.resolve({
      success: false,
      errorCode: 'PROVIDER_DISABLED',
      errorMessage: 'Fonnte WhatsApp provider is future-only and disabled by default.',
      retryable: false,
    });
  }

  validateRecipient(recipientAddress: string): boolean {
    return /^62\d{8,15}$/.test(recipientAddress);
  }
}
