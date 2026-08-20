import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { VehicleRepository } from '../../vehicle/repositories/vehicle.repository';
import { PARKING_AUDIT_ACTIONS } from '../constants/parking.constants';
import { ParkingCapacityHelper } from '../helpers/parking-capacity.helper';
import { ParkingCodeGenerator } from '../helpers/parking-code-generator';
import { ParkingSlotRepository } from '../repositories/parking-slot.repository';
import { ParkingAssignmentHistoryRepository } from '../repositories/parking-assignment-history.repository';
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
    private readonly database: DatabaseService,
    private readonly zones: ParkingZoneRepository,
    private readonly slots: ParkingSlotRepository,
    private readonly vehicles: VehicleRepository,
    private readonly histories: ParkingAssignmentHistoryRepository,
    private readonly audit: AuditRepository,
  ) {}

  listZones(propertyId: string, activeOnly?: boolean): Promise<ParkingZoneRecord[]> {
    return this.zones.list(propertyId, activeOnly);
  }

  listSlots(zoneId: string, status?: ParkingSlotStatus): Promise<ParkingSlotRecord[]> {
    return this.slots.list(zoneId, status);
  }

  async createZone(
    input: CreateParkingZoneInput,
    context: AuditActorContext = {},
  ): Promise<ParkingZoneRecord> {
    const normalized = { ...input, zoneCode: ParkingCodeGenerator.zoneCode(input.zoneCode) };
    return this.command(context, input.propertyId, '/parking/zones', normalized, async (client) => {
      const zone = await this.zones.create(normalized, client);
      await this.writeParkingAudit(
        PARKING_AUDIT_ACTIONS.zoneCreate,
        'parking_zone',
        zone.id,
        zone.propertyId,
        context,
        {
          id: zone.id,
          zoneCode: zone.zoneCode,
          zoneType: zone.zoneType,
          capacity: zone.capacity,
        },
        client,
      );
      await this.writeParkingEvent(
        client,
        zone.propertyId,
        `parking-zone:${zone.id}:created:${context.idempotencyKey}`,
        'parking.zone_created',
        zone.id,
        context,
        {
          zone_id: zone.id,
          zone_code: zone.zoneCode,
        },
      );
      return zone;
    });
  }

  async createSlot(
    input: CreateParkingSlotInput,
    context: AuditActorContext = {},
  ): Promise<ParkingSlotRecord> {
    const zone = await this.getZone(input.zoneId);
    const normalized = { ...input, slotNumber: ParkingCodeGenerator.slotNumber(input.slotNumber) };
    return this.command(
      context,
      zone.propertyId,
      `/parking/zones/${zone.id}/slots`,
      normalized,
      async (client) => {
        const lockedZone = await this.zoneForUpdate(zone.id, client);
        if (!lockedZone)
          throw new NotFoundException({
            code: 'PARKING_ZONE_NOT_FOUND',
            message: 'Parking zone not found',
          });
        const currentSlotCount = await this.slots.countByZone(zone.id, client);
        ParkingCapacityHelper.assertHasCapacity(lockedZone.capacity, currentSlotCount);
        const slot = await this.slots.create(normalized, client);
        await this.writeParkingAudit(
          PARKING_AUDIT_ACTIONS.slotCreate,
          'parking_slot',
          slot.id,
          lockedZone.property_id,
          context,
          {
            id: slot.id,
            slotNumber: slot.slotNumber,
            slotType: slot.slotType,
            zoneId: slot.zoneId,
          },
          client,
        );
        await this.writeParkingEvent(
          client,
          lockedZone.property_id,
          `parking-slot:${slot.id}:created:${context.idempotencyKey}`,
          'parking.slot_created',
          slot.id,
          context,
          {
            slot_id: slot.id,
            zone_id: slot.zoneId,
          },
        );
        return slot;
      },
    );
  }

  async assignSlot(
    slotId: string,
    vehicleId: string,
    context: AuditActorContext = {},
  ): Promise<ParkingSlotRecord> {
    const propertyId = await this.propertyIdForSlot(slotId);
    return this.command(
      context,
      propertyId,
      `/parking/slots/${slotId}/assign`,
      { vehicleId },
      async (client) => {
        const slot = await this.slots.findByIdForUpdate(slotId, client);
        if (!slot)
          throw new NotFoundException({
            code: 'PARKING_SLOT_NOT_FOUND',
            message: 'Parking slot not found',
          });
        if (slot.slotStatus !== 'available')
          throw new BadRequestException({
            code: 'PARKING_SLOT_NOT_AVAILABLE',
            message: 'Parking slot is not available',
          });
        const vehicle = await this.vehicleForUpdate(vehicleId, client);
        if (!vehicle)
          throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
        if (vehicle.vehicle_status !== 'active')
          throw new BadRequestException({
            code: 'VEHICLE_NOT_ACTIVE',
            message: 'Vehicle must be active before slot assignment',
          });
        const zone = await this.zoneForUpdate(slot.zoneId, client);
        if (!zone)
          throw new NotFoundException({
            code: 'PARKING_ZONE_NOT_FOUND',
            message: 'Parking zone not found',
          });
        if (vehicle.property_id !== zone.property_id)
          throw new BadRequestException({
            code: 'PARKING_PROPERTY_MISMATCH',
            message: 'Vehicle and parking slot are not in the same property',
          });
        if (!this.isVehicleCompatibleWithSlot(slot.slotType, vehicle.vehicle_type))
          throw new BadRequestException({
            code: 'PARKING_SLOT_TYPE_MISMATCH',
            message: 'Parking slot type does not match vehicle type',
          });
        await this.assertResidentActiveStay(vehicle.resident_id, zone.property_id, client);
        const updated = await this.slots.assign(slot.id, vehicle.id, client);
        if (!updated)
          throw new NotFoundException({
            code: 'PARKING_SLOT_NOT_FOUND',
            message: 'Parking slot not found',
          });
        await this.histories.record(
          {
            propertyId: zone.property_id,
            slotId: updated.id,
            vehicleId: vehicle.id,
            action: 'assigned',
            reason: null,
            actorUserId: context.actorUserId ?? null,
            metadata: { source: 'parking_assign' },
          },
          client,
        );
        await this.writeParkingAudit(
          PARKING_AUDIT_ACTIONS.slotAssign,
          'parking_slot',
          updated.id,
          vehicle.property_id,
          context,
          { id: updated.id, vehicleId: updated.vehicleId, slotStatus: updated.slotStatus },
          client,
        );
        await this.writeParkingEvent(
          client,
          zone.property_id,
          `parking-slot:${updated.id}:assigned:${context.idempotencyKey}`,
          'parking.slot_assigned',
          updated.id,
          context,
          { slot_id: updated.id, vehicle_id: vehicle.id },
        );
        return updated;
      },
    );
  }

  async releaseSlot(slotId: string, context: AuditActorContext = {}): Promise<ParkingSlotRecord> {
    const propertyId = await this.propertyIdForSlot(slotId);
    return this.command(
      context,
      propertyId,
      `/parking/slots/${slotId}/release`,
      {},
      async (client) => {
        const current = await this.slots.findByIdForUpdate(slotId, client);
        if (!current)
          throw new NotFoundException({
            code: 'PARKING_SLOT_NOT_FOUND',
            message: 'Parking slot not found',
          });
        if (!current.vehicleId) return current;
        const zone = await this.zoneForUpdate(current.zoneId, client);
        if (!zone)
          throw new NotFoundException({
            code: 'PARKING_ZONE_NOT_FOUND',
            message: 'Parking zone not found',
          });
        const updated = await this.slots.release(current.id, client);
        if (!updated)
          throw new NotFoundException({
            code: 'PARKING_SLOT_NOT_FOUND',
            message: 'Parking slot not found',
          });
        await this.histories.record(
          {
            propertyId: zone.property_id,
            slotId: updated.id,
            vehicleId: current.vehicleId,
            action: 'released',
            reason: 'Manual parking release',
            actorUserId: context.actorUserId ?? null,
            metadata: { source: 'parking_release' },
          },
          client,
        );
        await this.writeParkingAudit(
          PARKING_AUDIT_ACTIONS.slotRelease,
          'parking_slot',
          updated.id,
          zone.property_id,
          context,
          { id: updated.id, previousVehicleId: current.vehicleId, slotStatus: updated.slotStatus },
          client,
        );
        await this.writeParkingEvent(
          client,
          zone.property_id,
          `parking-slot:${updated.id}:released:${context.idempotencyKey}`,
          'parking.slot_released',
          updated.id,
          context,
          { slot_id: updated.id, vehicle_id: current.vehicleId },
        );
        return updated;
      },
    );
  }

  async zoneCapacity(zoneId: string): Promise<ParkingCapacitySnapshot> {
    const zone = await this.getZone(zoneId);
    const occupied = await this.slots.countOccupied(zone.id);
    return ParkingCapacityHelper.snapshot(zone.capacity, occupied);
  }

  async getZone(zoneId: string): Promise<ParkingZoneRecord> {
    const zone = await this.zones.findById(zoneId);
    if (!zone) {
      throw new NotFoundException({
        code: 'PARKING_ZONE_NOT_FOUND',
        message: 'Parking zone not found',
      });
    }
    return zone;
  }

  async getSlot(slotId: string): Promise<ParkingSlotRecord> {
    const slot = await this.slots.findById(slotId);
    if (!slot) {
      throw new NotFoundException({
        code: 'PARKING_SLOT_NOT_FOUND',
        message: 'Parking slot not found',
      });
    }
    return slot;
  }

  listAssignmentHistory(slotId: string) {
    return this.histories.listForSlot(slotId);
  }

  private async writeParkingAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    propertyId: string | undefined,
    context: AuditActorContext,
    afterData: Record<string, unknown>,
    client?: PoolClient,
  ): Promise<void> {
    await this.audit.write(
      {
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
      },
      client,
    );
  }

  private async propertyIdForSlot(slotId: string): Promise<string> {
    const slot = await this.getSlot(slotId);
    const zone = await this.getZone(slot.zoneId);
    return zone.propertyId;
  }

  private async vehicleForUpdate(vehicleId: string, client: PoolClient) {
    const result = await client.query<{
      id: string;
      property_id: string;
      resident_id: string;
      vehicle_status: string;
      vehicle_type: string;
    }>(
      `SELECT id, property_id, resident_id, vehicle_status, vehicle_type FROM vehicles WHERE id=$1 FOR UPDATE`,
      [vehicleId],
    );
    return result.rows[0] ?? null;
  }

  private async assertResidentActiveStay(
    residentId: string,
    propertyId: string,
    client: PoolClient,
  ): Promise<void> {
    const result = await client.query<{ resident_id: string }>(
      `SELECT resident_id
       FROM occupancies
       WHERE property_id = $1
         AND resident_id = $2
         AND occupancy_status = 'active'
       LIMIT 1`,
      [propertyId, residentId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException({
        code: 'PARKING_RESIDENT_NOT_IN_ACTIVE_STAY',
        message:
          'Parking can only be assigned to a vehicle whose resident has an active stay in this property',
      });
    }
  }

  private isVehicleCompatibleWithSlot(
    slotType: ParkingSlotRecord['slotType'],
    vehicleType: string,
  ): boolean {
    if (slotType === 'car') return vehicleType === 'car';
    return (
      vehicleType === 'motorcycle' ||
      vehicleType === 'bicycle' ||
      vehicleType === 'electric_scooter'
    );
  }

  private async zoneForUpdate(zoneId: string, client: PoolClient) {
    const result = await client.query<{ id: string; property_id: string; capacity: number }>(
      `SELECT id, property_id, capacity FROM parking_zones WHERE id=$1 FOR UPDATE`,
      [zoneId],
    );
    return result.rows[0] ?? null;
  }

  private async command<T>(
    context: AuditActorContext,
    propertyId: string,
    route: string,
    payload: unknown,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const actor = context.actorUserId;
    const key = context.idempotencyKey?.trim();
    if (!actor || !key || key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required',
      });
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ route, actor, propertyId, payload }))
      .digest('hex');
    return this.database.transaction(async (client) => {
      const inserted = await client.query<{ request_fingerprint: string }>(
        `INSERT INTO idempotency_commands(property_id,actor_user_id,route,idempotency_key,request_fingerprint,correlation_id)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_user_id,route,idempotency_key) DO NOTHING RETURNING request_fingerprint`,
        [propertyId, actor, route, key, fingerprint, context.correlationId ?? null],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query<{
          request_fingerprint: string;
          command_status: string;
          response_body: unknown;
        }>(
          `SELECT request_fingerprint, command_status, response_body FROM idempotency_commands WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [actor, route, key],
        );
        const row = existing.rows[0];
        if (!row || row.command_status === 'pending')
          throw new BadRequestException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command is still in progress',
          });
        if (row.request_fingerprint !== fingerprint)
          throw new BadRequestException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used with a different payload',
          });
        const stored = row.response_body as { data?: T } | null;
        if (!stored || !Object.prototype.hasOwnProperty.call(stored, 'data'))
          throw new BadRequestException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command has no replayable result',
          });
        return stored.data as T;
      }
      const result = await operation(client);
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded', response_status=200, response_body=$1::jsonb, completed_at=now() WHERE actor_user_id=$2 AND route=$3 AND idempotency_key=$4`,
        [JSON.stringify({ data: result }), actor, route, key],
      );
      return result;
    });
  }

  private async writeParkingEvent(
    client: PoolClient,
    propertyId: string,
    eventKey: string,
    eventType: string,
    slotId: string,
    context: AuditActorContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id) VALUES($1,$2,$3,'parking_slot',$4,$5::jsonb,$6,$7) ON CONFLICT(event_key) DO NOTHING`,
      [
        propertyId,
        eventKey,
        eventType,
        slotId,
        JSON.stringify(payload),
        context.correlationId ?? null,
        context.actorUserId ?? null,
      ],
    );
  }
}
