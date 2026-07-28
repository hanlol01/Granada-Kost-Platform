import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { CreateCheckOutRequestDto } from './dto/create-check-out.dto';
import { FinalizeCheckOutDto } from './dto/finalize-check-out.dto';
import { ListOccupanciesQueryDto } from './dto/list-occupancies-query.dto';
import { OccupancyRepository } from './repositories/occupancy.repository';

@Injectable()
export class OccupancyService {
  constructor(
    private readonly occupancies: OccupancyRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListOccupanciesQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    return this.occupancies.list(query, this.scopeIds(user));
  }

  async listActive(user: UserAccessContext, propertyId?: string) {
    return this.list(user, { property_id: propertyId, status: 'active' });
  }

  async get(user: UserAccessContext, occupancyId: string) {
    const occupancy = await this.requireOccupancy(occupancyId);
    await this.properties.assertCanReadProperty(user, occupancy.propertyId);
    return occupancy;
  }

  async getActiveByRoom(user: UserAccessContext, roomId: string) {
    const occupancy = await this.occupancies.findActiveByRoom(roomId);
    if (!occupancy) {
      throw new NotFoundException({
        code: 'ACTIVE_OCCUPANCY_NOT_FOUND',
        message: 'Active occupancy was not found for this room',
      });
    }
    await this.properties.assertCanReadProperty(user, occupancy.propertyId);
    return occupancy;
  }

  async completeCheckIn(user: UserAccessContext, dto: CreateCheckInDto) {
    await this.assertCanMutateProperty(user, dto.property_id);
    throw new ConflictException({
      code: 'LEASE_REQUIRED',
      message: 'Move-in must use lease creation',
    });
  }

  async listCheckOutRequests(user: UserAccessContext) {
    return this.occupancies.listCheckOutRequests(this.scopeIds(user));
  }

  async createCheckOutRequest(
    user: UserAccessContext,
    dto: CreateCheckOutRequestDto,
    context: RequestAuditContext,
  ) {
    const occupancy = await this.requireOccupancy(dto.occupancy_id, this.scopeIds(user));
    await this.assertCanMutateProperty(user, occupancy.propertyId);
    await this.occupancies.assertLegacyCheckoutEligible(occupancy);
    const checkOut = await this.occupancies.createCheckOutRequest(dto, user.id, occupancy);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: checkOut.propertyId,
      action: 'check_out.request',
      resourceType: 'check_out_request',
      resourceId: checkOut.id,
      afterData: this.checkoutAuditSnapshot(checkOut),
      resultStatus: 'success',
      ...context,
    });
    return checkOut;
  }

  async approveCheckOut(user: UserAccessContext, checkOutId: string, context: RequestAuditContext) {
    const checkOut = await this.requireCheckOut(checkOutId, this.scopeIds(user));
    await this.assertCanMutateProperty(user, checkOut.propertyId);
    await this.assertLegacyCheckoutEligible(checkOut);
    const updated = await this.occupancies.updateCheckOutStatus(checkOut, 'approved', user.id);
    if (!updated) {
      throw new NotFoundException({
        code: 'CHECK_OUT_NOT_FOUND',
        message: 'Check-out request not found or not reviewable',
      });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'check_out.approve',
      resourceType: 'check_out_request',
      resourceId: updated.id,
      afterData: this.checkoutAuditSnapshot(updated),
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async rejectCheckOut(user: UserAccessContext, checkOutId: string, context: RequestAuditContext) {
    const checkOut = await this.requireCheckOut(checkOutId, this.scopeIds(user));
    await this.assertCanMutateProperty(user, checkOut.propertyId);
    await this.assertLegacyCheckoutEligible(checkOut);
    const updated = await this.occupancies.updateCheckOutStatus(checkOut, 'rejected', user.id);
    if (!updated) {
      throw new NotFoundException({
        code: 'CHECK_OUT_NOT_FOUND',
        message: 'Check-out request not found or not reviewable',
      });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'check_out.reject',
      resourceType: 'check_out_request',
      resourceId: updated.id,
      afterData: this.checkoutAuditSnapshot(updated),
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async finalizeCheckOut(
    user: UserAccessContext,
    checkOutId: string,
    dto: FinalizeCheckOutDto,
    context: RequestAuditContext,
  ) {
    const checkOut = await this.requireCheckOut(checkOutId, this.scopeIds(user));
    await this.assertCanMutateProperty(user, checkOut.propertyId);
    await this.assertLegacyCheckoutEligible(checkOut);
    const finalized = await this.occupancies.finalizeCheckOut(checkOut, dto, user.id);
    if (!finalized) {
      throw new NotFoundException({
        code: 'CHECK_OUT_NOT_FOUND',
        message: 'Check-out request not found',
      });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: finalized.propertyId,
      action: 'occupancy.legacy_checkout',
      resourceType: 'occupancy',
      resourceId: finalized.occupancyId,
      afterData: {
        check_out_status: finalized.checkOutStatus,
        end_date: dto.end_date,
        room_status_after: dto.room_status_after,
      },
      resultStatus: 'success',
      ...context,
    });
    return finalized;
  }

  private scopeIds(user: UserAccessContext): string[] | undefined {
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(
    user: UserAccessContext,
    propertyId: string,
  ): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate operational data',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async requireOccupancy(occupancyId: string, propertyIds?: string[]) {
    const occupancy = await this.occupancies.findById(occupancyId, propertyIds);
    if (!occupancy) {
      throw new NotFoundException({ code: 'OCCUPANCY_NOT_FOUND', message: 'Occupancy not found' });
    }
    return occupancy;
  }

  private async requireCheckOut(checkOutId: string, propertyIds?: string[]) {
    const checkOut = await this.occupancies.findCheckOutById(checkOutId, propertyIds);
    if (!checkOut) {
      throw new NotFoundException({
        code: 'CHECK_OUT_NOT_FOUND',
        message: 'Check-out request not found',
      });
    }
    return checkOut;
  }

  private async assertLegacyCheckoutEligible(checkOut: {
    occupancyId: string;
    propertyId: string;
    roomId: string;
    residentId: string;
  }): Promise<void> {
    const occupancy = await this.requireOccupancy(checkOut.occupancyId, [checkOut.propertyId]);
    if (
      occupancy.propertyId !== checkOut.propertyId ||
      occupancy.roomId !== checkOut.roomId ||
      occupancy.residentId !== checkOut.residentId
    ) {
      throw new ConflictException({
        code: 'CHECK_OUT_OCCUPANCY_MISMATCH',
        message: 'Check-out request does not match its occupancy',
      });
    }
    await this.occupancies.assertLegacyCheckoutEligible(occupancy);
  }

  private checkoutAuditSnapshot(checkOut: {
    checkOutStatus: string;
    requestedCheckOutDate: string;
    finalizedAt: Date | null;
  }) {
    return {
      check_out_status: checkOut.checkOutStatus,
      requested_check_out_date: checkOut.requestedCheckOutDate,
      finalized_at: checkOut.finalizedAt,
    };
  }
}
