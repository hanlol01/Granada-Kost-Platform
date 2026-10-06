import { Module } from '@nestjs/common';
import { NotificationEventProjector } from './notification-event-projector';

@Module({ providers: [NotificationEventProjector] })
export class NotificationEventsModule {}
