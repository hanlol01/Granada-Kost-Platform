import { Module } from '@nestjs/common';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { MyNotificationPreferenceController } from './controllers/my-notification-preference.controller';
import { MyNotificationController } from './controllers/my-notification.controller';
import { NotificationDeliveryController } from './controllers/notification-delivery.controller';
import { NotificationChannelRouter } from './helpers/notification-channel-router';
import { NotificationQuotaHelper } from './helpers/notification-quota.helper';
import { NotificationRecipientResolver } from './helpers/notification-recipient-resolver';
import { NotificationRetryHelper } from './helpers/notification-retry.helper';
import { NotificationTemplateRenderer } from './helpers/notification-template-renderer';
import { BrevoEmailProvider } from './providers/brevo-email.provider';
import { FonnteWhatsappProvider } from './providers/fonnte-whatsapp.provider';
import { WebPushProvider } from './providers/web-push.provider';
import { NotificationDeliveryRepository } from './repositories/notification-delivery.repository';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [RbacModule, PropertyModule],
  controllers: [MyNotificationController, MyNotificationPreferenceController, NotificationDeliveryController],
  providers: [
    NotificationRepository,
    NotificationDeliveryRepository,
    NotificationPreferenceRepository,
    NotificationService,
    NotificationDeliveryService,
    NotificationPreferenceService,
    BrevoEmailProvider,
    FonnteWhatsappProvider,
    WebPushProvider,
    NotificationChannelRouter,
    NotificationTemplateRenderer,
    NotificationRetryHelper,
    NotificationQuotaHelper,
    NotificationRecipientResolver,
  ],
  exports: [
    NotificationService,
    NotificationDeliveryService,
    NotificationPreferenceService,
    NotificationRecipientResolver,
    NotificationTemplateRenderer,
  ],
})
export class NotificationModule {}
