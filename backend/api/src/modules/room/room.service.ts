import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateRoomFacilityDto } from './dto/create-room-facility.dto';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { ListRoomsQueryDto } from './dto/list-rooms-query.dto';
import { UpdateRoomDto, UpdateRoomStatusDto } from './dto/update-room.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { RoomRepository } from './repositories/room.repository';

@Injectable()
export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async listRooms(user: UserAccessContext, query: ListRoomsQueryDto) {
    if (query.property_id) {
      await this.properties.assertCanReadProperty(user, query.property_id);
    }
    return this.rooms.listRooms(query, this.scopeIds(user));
  }

  async getRoom(user: UserAccessContext, roomId: string) {
    const room = await this.requireRoom(roomId);
    await this.properties.assertCanReadProperty(user, room.propertyId);
    return room;
  }

  async createRoom(user: UserAccessContext, dto: CreateRoomDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const room = await this.rooms.createRoom(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: room.propertyId,
      action: 'room.create',
      resourceType: 'room',
      resourceId: room.id,
      afterData: room,
      resultStatus: 'success',
      ...context,
    });
    return room;
  }

  async updateRoom(user: UserAccessContext, roomId: string, dto: UpdateRoomDto, context: RequestAuditContext) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.rooms.updateRoom(roomId, dto, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'room.update',
      resourceType: 'room',
      resourceId: roomId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async updateRoomStatus(
    user: UserAccessContext,
    roomId: string,
    dto: UpdateRoomStatusDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireRoom(roomId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.rooms.updateRoomStatus(roomId, dto.status, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'room.status_update',
      resourceType: 'room',
      resourceId: roomId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async availability(user: UserAccessContext, propertyId?: string) {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return this.rooms.availability(propertyId);
    }

    if (user.roles.includes('owner')) {
      return this.rooms.availability();
    }

    const results = [];
    for (const id of user.propertyIds) {
      results.push(...(await this.rooms.availability(id)));
    }
    return results;
  }

  async listRoomTypes(user: UserAccessContext) {
    return this.rooms.listRoomTypes(this.scopeIds(user));
  }

  async createRoomType(user: UserAccessContext, dto: CreateRoomTypeDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const roomType = await this.rooms.createRoomType(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: roomType.propertyId,
      action: 'room_type.create',
      resourceType: 'room_type',
      resourceId: roomType.id,
      afterData: roomType,
      resultStatus: 'success',
      ...context,
    });
    return roomType;
  }

  async updateRoomType(user: UserAccessContext, roomTypeId: string, dto: UpdateRoomTypeDto, context: RequestAuditContext) {
    const before = await this.rooms.findRoomType(roomTypeId);
    if (!before) {
      throw new NotFoundException({ code: 'ROOM_TYPE_NOT_FOUND', message: 'Room type not found' });
    }
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.rooms.updateRoomType(roomTypeId, dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: before.propertyId,
      action: 'room_type.update',
      resourceType: 'room_type',
      resourceId: roomTypeId,
      beforeData: before,
      afterData: updated,
      resultStatus: 'success',
      ...context,
    });
    return updated;
  }

  async listFacilities(user: UserAccessContext) {
    return this.rooms.listFacilities(this.scopeIds(user));
  }

  async createFacility(user: UserAccessContext, dto: CreateRoomFacilityDto, context: RequestAuditContext) {
    await this.assertCanMutateProperty(user, dto.property_id);
    const facility = await this.rooms.createFacility(dto, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: facility.propertyId,
      action: 'room_facility.create',
      resourceType: 'room_facility',
      resourceId: facility.id,
      afterData: facility,
      resultStatus: 'success',
      ...context,
    });
    return facility;
  }

  private scopeIds(user: UserAccessContext): string[] | undefined {
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(user: UserAccessContext, propertyId: string): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate operational data',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async requireRoom(roomId: string) {
    const room = await this.rooms.findRoom(roomId);
    if (!room) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' });
    }
    return room;
  }
}
