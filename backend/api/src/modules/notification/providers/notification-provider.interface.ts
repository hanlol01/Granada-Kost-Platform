import { NotificationChannel, NotificationProviderName, ProviderSendRequest, ProviderSendResult } from '../types/notification.types';

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly providerName: NotificationProviderName;
  readonly enabled: boolean;

  send(request: ProviderSendRequest): Promise<ProviderSendResult>;
  validateRecipient(recipientAddress: string): boolean;
}
