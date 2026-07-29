import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { AssignPropertyOwnerDto } from './dto/assign-property-owner.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { UpdatePropertyStatusDto } from './dto/update-property-status.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyRepository } from './repositories/property.repository';
import { PropertyRecord, RequestAuditContext } from './types/property.types';

@Injectable()
export class PropertyService {
  constructor(
    private readonly properties: PropertyRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext): Promise<PropertyRecord[]> {
    if (this.hasGlobalPropertyRead(user)) {
      return this.properties.listAll();
    }

    if (user.roles.includes('property_owner')) {
      return this.properties.listForPropertyOwner(user.id);
    }

    return this.properties.listByIds(user.propertyIds);
  }

  async create(user: UserAccessContext, dto: CreatePropertyDto, context: RequestAuditContext) {
    const property = await this.properties.create(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: property.id,
      action: 'property.create',
      resourceType: 'property',
      resourceId: property.id,
      afterData: property,
      resultStatus: 'success',
      ...context,
    });
    return property;
  }

  async get(user: UserAccessContext, propertyId: string) {
    await this.assertCanReadProperty(user, propertyId);
    const property = await this.properties.findById(propertyId);
    if (!property) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
    }
    return property;
  }

  async update(
    user: UserAccessContext,
    propertyId: string,
    dto: UpdatePropertyDto,
    context: RequestAuditContext,
  ) {
    this.assertCanManageProperty(user, propertyId);
    return this.properties.transaction(async (client) => {
      const before = await this.requireProperty(propertyId, client, true);
      const updated = await this.properties.update(propertyId, dto, user.id, client);
      if (!updated) {
        throw new NotFoundException({
          code: 'PROPERTY_NOT_FOUND',
          message: 'Property not found',
        });
      }

      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'property.update',
          resourceType: 'property',
          resourceId: propertyId,
          beforeData: this.propertyAuditData(before),
          afterData: this.propertyAuditData(updated),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      return updated;
    });
  }

  async updateStatus(
    user: UserAccessContext,
    propertyId: string,
    dto: UpdatePropertyStatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireProperty(propertyId);
    const updated = await this.properties.updateStatus(propertyId, dto.status, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
    }

    await this.audit.write({
      actorUserId: user.id,
      propertyId,
      action: 'property.status_update',
      resourceType: 'property',
      resourceId: propertyId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async getSettings(user: UserAccessContext, propertyId: string) {
    await this.assertCanReadProperty(user, propertyId);
    await this.requireProperty(propertyId);
    return this.properties.getSettings(propertyId);
  }

  async updateSettings(
    user: UserAccessContext,
    propertyId: string,
    dto: UpdatePropertySettingsDto,
    context: RequestAuditContext,
  ) {
    this.assertCanManageProperty(user, propertyId);
    return this.properties.transaction(async (client) => {
      await this.requireProperty(propertyId, client, true);
      const before = await this.properties.getSettings(propertyId, client);
      const updated = await this.properties.updateSettings(propertyId, dto, client);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'property.settings_update',
          resourceType: 'property_settings',
          resourceId: propertyId,
          beforeData: before ? this.settingsAuditData(before) : null,
          afterData: this.settingsAuditData(updated),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      return updated;
    });
  }

  async assignOwner(
    user: UserAccessContext,
    propertyId: string,
    dto: AssignPropertyOwnerDto,
    context: RequestAuditContext,
  ) {
    this.assertCanManageProperty(user, propertyId);
    return this.properties.transaction(async (client) => {
      await this.requireProperty(propertyId, client, true);
      await this.properties.assignPropertyOwner(
        propertyId,
        dto.user_id,
        dto.ownership_label ?? null,
        user.id,
        client,
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'property_owner.assign',
          resourceType: 'property_owner_assignment',
          resourceId: propertyId,
          afterData: {
            userId: dto.user_id,
            ownershipLabel: dto.ownership_label ?? null,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      return { success: true };
    });
  }

  async revokeOwner(
    user: UserAccessContext,
    propertyId: string,
    ownerUserId: string,
    context: RequestAuditContext,
  ) {
    this.assertCanManageProperty(user, propertyId);
    return this.properties.transaction(async (client) => {
      await this.requireProperty(propertyId, client, true);
      await this.properties.revokePropertyOwner(propertyId, ownerUserId, client);
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId,
          action: 'property_owner.revoke',
          resourceType: 'property_owner_assignment',
          resourceId: propertyId,
          beforeData: { userId: ownerUserId },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      return { success: true };
    });
  }

  async assertCanReadProperty(user: UserAccessContext, propertyId: string): Promise<void> {
    if (this.hasGlobalPropertyRead(user) || user.propertyIds.includes(propertyId)) {
      return;
    }

    if (
      user.roles.includes('property_owner') &&
      (await this.properties.isPropertyOwner(user.id, propertyId))
    ) {
      return;
    }

    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to access this property',
    });
  }

  private hasGlobalPropertyRead(user: UserAccessContext): boolean {
    return user.roles.includes('owner');
  }

  private assertCanManageProperty(user: UserAccessContext, propertyId: string): void {
    const hasRole = user.roles.includes('owner') || user.roles.includes('manager');
    const hasPermission = user.permissions.includes('property.manage');
    const hasScope =
      user.roles.includes('owner') ||
      (user.roles.includes('manager') && user.propertyIds.includes(propertyId));

    if (hasRole && hasPermission && hasScope) {
      return;
    }

    throw new ForbiddenException({
      code: 'PROPERTY_SCOPE_DENIED',
      message: 'User is not allowed to manage this property',
    });
  }

  private async requireProperty(
    propertyId: string,
    client?: PoolClient,
    lockForUpdate = false,
  ): Promise<PropertyRecord> {
    const property = await this.properties.findById(propertyId, client, lockForUpdate);
    if (!property) {
      throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'Property not found' });
    }
    return property;
  }

  private propertyAuditData(property: PropertyRecord) {
    return {
      name: property.name,
      address: property.address,
      phone: property.phone,
      email: property.email,
      timezone: property.timezone,
    };
  }

  private settingsAuditData(settings: {
    defaultDueDay: number;
    lateFeePercentPerDay: string;
    bookingFeeAmount: number;
    quietHourStart: string | null;
    guestReportDeadline: string | null;
  }) {
    return {
      defaultDueDay: settings.defaultDueDay,
      lateFeePercentPerDay: settings.lateFeePercentPerDay,
      bookingFeeAmount: settings.bookingFeeAmount,
      quietHourStart: settings.quietHourStart,
      guestReportDeadline: settings.guestReportDeadline,
    };
  }
}
