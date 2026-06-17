import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { VehicleRepository } from '../../vehicle/repositories/vehicle.repository';
import { PARKING_AUDIT_ACTIONS } from '../constants/parking.constants';
import { ParkingCapacityHelper } from '../helpers/parking-capacity.helper';
import { ParkingCodeGenerator } from '../helpers/parking-code-generator';
import { ParkingSlotRepository } from '../repositories/parking-slot.repository';
import { ParkingZoneRepository } from '../repositories/parking-zone.repository';
import {
  AuditActorContext,
  CreateParkingSlotInput,
  CreateParkingZoneInput,
  ParkingCapacitySnapshot,
  ParkingSlotRecord,
  ParkingSlotStatus,
  ParkingZoneRecord,
} from '../types/parking.types';

@Injectable()
export class ParkingService {
  constructor(
    private readonly zones: ParkingZoneRepository,
    private readonly slots: ParkingSlotRepository,
    private readonly vehicles: VehicleRepository,
    private readonly audit: AuditRepository,
  ) {}

  listZones(propertyId: string, activeOnly?: boolean): Promise<ParkingZoneRecord[]> {
    return this.zones.list(propertyId, activeOnly);
  }

  listSlots(zoneId: string, status?: ParkingSlotStatus): Promise<ParkingSlotRecord[]> {
    return this.slots.list(zoneId, status);
  }

  async createZone(input: CreateParkingZoneInput, context: AuditActorContext = {}): Promise<ParkingZoneRecord> {
    const zone = await this.zones.create({
      ...input,
      zoneCode: ParkingCodeGenerator.zoneCode(input.zoneCode),
    });
    await this.writeParkingAudit(PARKING_AUDIT_ACTIONS.zoneCreate, 'parking_zone', zone.id, zone.propertyId, context, {
      id: zone.id,
      zoneCode: zone.zoneCode,
      zoneType: zone.zoneType,
      capacity: zone.capacity,
    });
    return zone;
  }

  async createSlot(input: CreateParkingSlotInput): Promise<ParkingSlotRecord> {
    const zone = await this.getZone(input.zoneId);
    const currentSlotCount = await this.slots.countByZone(zone.id);
    ParkingCapacityHelper.assertHasCapacity(zone.capacity, currentSlotCount);
    return this.slots.create({
      ...input,
      slotNumber: ParkingCodeGenerator.slotNumber(input.slotNumber),
    });
  }

  async assignSlot(slotId: string, vehicleId: string, context: AuditActorContext = {}): Promise<ParkingSlotRecord> {
    const slot = await this.getSlot(slotId);
    if (slot.slotStatus !== 'available') {
      throw new BadRequestException({ code: 'PARKING_SLOT_NOT_AVAILABLE', message: 'Parking slot is not available' });
    }

    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
    }
    if (vehicle.vehicleStatus !== 'active') {
      throw new BadRequestException({ code: 'VEHICLE_NOT_ACTIVE', message: 'Vehicle must be active before slot assignment' });
    }
    const zone = await this.getZone(slot.zoneId);
    if (vehicle.propertyId !== zone.propertyId) {
      throw new BadRequestException({ code: 'PARKING_PROPERTY_MISMATCH', message: 'Vehicle and parking slot are not in the same property' });
    }
    if (slot.slotType !== vehicle.vehicleType) {
      throw new BadRequestException({ code: 'PARKING_SLOT_TYPE_MISMATCH', message: 'Parking slot type does not match vehicle type' });
    }

    const updated = await this.slots.assign(slot.id, vehicle.id);
    if (!updated) {
      throw new NotFoundException({ code: 'PARKING_SLOT_NOT_FOUND', message: 'Parking slot not found' });
    }
    await this.writeParkingAudit(PARKING_AUDIT_ACTIONS.slotAssign, 'parking_slot', updated.id, vehicle.propertyId, context, {
      id: updated.id,
      vehicleId: updated.vehicleId,
      slotStatus: updated.slotStatus,
    });
    return updated;
  }

  async releaseSlot(slotId: string, context: AuditActorContext = {}): Promise<ParkingSlotRecord> {
    const current = await this.getSlot(slotId);
    const zone = await this.getZone(current.zoneId);
    const propertyId = zone.propertyId;
    const updated = await this.slots.release(current.id);
    if (!updated) {
      throw new NotFoundException({ code: 'PARKING_SLOT_NOT_FOUND', message: 'Parking slot not found' });
    }
    await this.writeParkingAudit(PARKING_AUDIT_ACTIONS.slotRelease, 'parking_slot', updated.id, propertyId, context, {
      id: updated.id,
      previousVehicleId: current.vehicleId,
      slotStatus: updated.slotStatus,
    });
    return updated;
  }

  async zoneCapacity(zoneId: string): Promise<ParkingCapacitySnapshot> {
    const zone = await this.getZone(zoneId);
    const occupied = await this.slots.countOccupied(zone.id);
    return ParkingCapacityHelper.snapshot(zone.capacity, occupied);
  }

  async getZone(zoneId: string): Promise<ParkingZoneRecord> {
    const zone = await this.zones.findById(zoneId);
    if (!zone) {
      throw new NotFoundException({ code: 'PARKING_ZONE_NOT_FOUND', message: 'Parking zone not found' });
    }
    return zone;
  }

  async getSlot(slotId: string): Promise<ParkingSlotRecord> {
    const slot = await this.slots.findById(slotId);
    if (!slot) {
      throw new NotFoundException({ code: 'PARKING_SLOT_NOT_FOUND', message: 'Parking slot not found' });
    }
    return slot;
  }

  private async writeParkingAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    propertyId: string | undefined,
    context: AuditActorContext,
    afterData: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      actorUserId: context.actorUserId,
      propertyId,
      action,
      resourceType,
      resourceId,
      afterData,
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });
  }
}
