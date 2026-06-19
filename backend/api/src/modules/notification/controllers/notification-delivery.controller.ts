import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { ListNotificationDeliveriesQueryDto } from '../dto/list-notification-deliveries-query.dto';
import { NotificationDeliveryService } from '../services/notification-delivery.service';
import {
  assertCanReadDeliveryProperty,
  scopedPropertyIds,
  toNotificationDeliveryResponse,
} from './notification-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('notifications')
export class NotificationDeliveryController {
  constructor(
    private readonly deliveries: NotificationDeliveryService,
    private readonly properties: PropertyService,
  ) {}

  @Get('deliveries')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListNotificationDeliveriesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const records = await this.deliveries.list(
      {
        propertyId: query.property_id,
        propertyIds,
        status: query.status,
        channel: query.channel,
      },
      query.limit,
      query.offset,
    );
    return records.map((record) => toNotificationDeliveryResponse(record));
  }

  @Get('dead-letter')
  async deadLetters(@CurrentUser() user: UserAccessContext, @Query() query: ListNotificationDeliveriesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const records = await this.deliveries.deadLetters(
      {
        propertyId: query.property_id,
        propertyIds,
      },
      query.limit,
      query.offset,
    );
    return records.map((record) => toNotificationDeliveryResponse(record));
  }

  @Get('deliveries/:deliveryId')
  async get(@CurrentUser() user: UserAccessContext, @Param('deliveryId') deliveryId: string) {
    await assertCanReadDeliveryProperty(this.properties, user, await this.deliveries.propertyIdForDelivery(deliveryId));
    return toNotificationDeliveryResponse(await this.deliveries.get(deliveryId));
  }
}
