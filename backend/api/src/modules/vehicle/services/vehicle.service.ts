import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { selectSingleResidentContext } from '../../resident/resident.service';
import { VEHICLE_AUDIT_ACTIONS } from '../constants/vehicle.constants';
import { VehicleCodeGenerator } from '../helpers/vehicle-code-generator';
import { VehiclePlateNormalizer } from '../helpers/vehicle-plate-normalizer';
import { VehicleStatusTransitionHelper } from '../helpers/vehicle-status-transition.helper';
import { VehicleFileRepository } from '../repositories/vehicle-file.repository';
import { VehicleStatusHistoryRepository } from '../repositories/vehicle-status-history.repository';
import { VehicleRepository } from '../repositories/vehicle.repository';
import {
  AuditActorContext,
  CreateVehicleFileInput,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleFileRecord,
  VehicleRecord,
  VehicleSummaryRecord,
  VehicleStatus,
  VehicleType,
} from '../types/vehicle.types';

type RegisterVehicleInput = Omit<
  CreateVehicleInput,
  'plateNumber' | 'vehicleStatus' | 'approvedByUserId'
> & {
  plateNumber: string;
  adminCreated?: boolean;
};

@Injectable()
export class VehicleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly vehicles: VehicleRepository,
    private readonly histories: VehicleStatusHistoryRepository,
    private readonly files: VehicleFileRepository,
    private readonly audit: AuditRepository,
  ) {}

  list(
    propertyId: string,
    status?: VehicleStatus,
    vehicleType?: VehicleType,
    limit?: number,
    offset?: number,
  ): Promise<VehicleRecord[]> {
    return this.vehicles.list(propertyId, status, vehicleType, limit, offset);
  }

  listForProperties(
    propertyIds: string[],
    status?: VehicleStatus,
    vehicleType?: VehicleType,
    limit?: number,
    offset?: number,
  ): Promise<VehicleRecord[]> {
    return this.vehicles.listForProperties(propertyIds, status, vehicleType, limit, offset);
  }

  listForResident(residentId: string, limit?: number, offset?: number): Promise<VehicleRecord[]> {
    return this.vehicles.listForResident(residentId, limit, offset);
  }

  listForUser(userId: string, limit?: number, offset?: number): Promise<VehicleRecord[]> {
    return this.vehicles.listForUser(userId, limit, offset);
  }

  async get(vehicleId: string): Promise<VehicleRecord> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
    }
    return vehicle;
  }

  async getForUser(vehicleId: string, userId: string): Promise<VehicleRecord> {
    const vehicle = await this.vehicles.findByIdForUser(vehicleId, userId);
    if (!vehicle) {
      throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
    }
    return vehicle;
  }

  async activeResidentContextForUser(userId: string) {
    const context = selectSingleResidentContext(await this.vehicles.activeContextsForUser(userId));
    if (!context) {
      throw new BadRequestException({
        code: 'ACTIVE_OCCUPANCY_NOT_FOUND',
        message: 'Active occupancy not found for resident',
      });
    }
    return context;
  }

  async registerVehicle(
    input: RegisterVehicleInput,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    const plateNumber = VehiclePlateNormalizer.normalize(input.plateNumber);
    return this.command(
      context,
      input.propertyId,
      '/vehicles',
      { ...input, plateNumber },
      async (client) => {
        const settings = await this.vehicles.settings(input.propertyId, client);
        const maxVehicles = settings?.maxVehiclesPerResident ?? 3;
        const activeVehicleCount = await this.vehicles.nonTerminalCountForResident(
          input.propertyId,
          input.residentId,
          client,
        );
        if (activeVehicleCount >= maxVehicles) {
          throw new BadRequestException({
            code: 'VEHICLE_LIMIT_REACHED',
            message: 'Resident has reached vehicle limit',
          });
        }
        await this.assertPlateAvailable(input.propertyId, plateNumber, undefined, client);
        const vehicleStatus: VehicleStatus =
          input.adminCreated || settings?.parkingRequiresApproval === false
            ? 'active'
            : 'pending_approval';
        const vehicle = await this.vehicles.create(
          {
            ...input,
            plateNumber,
            vehicleStatus,
            approvedByUserId: vehicleStatus === 'active' ? context.actorUserId : undefined,
          },
          client,
        );
        await this.histories.record(
          {
            vehicleId: vehicle.id,
            fromStatus: null,
            toStatus: vehicle.vehicleStatus,
            actorUserId: context.actorUserId,
            notes:
              vehicle.vehicleStatus === 'active'
                ? 'Vehicle registered as active'
                : 'Vehicle registration submitted',
          },
          client,
        );
        await this.writeVehicleAudit(
          VEHICLE_AUDIT_ACTIONS.create,
          vehicle,
          context,
          undefined,
          client,
        );
        await this.writeVehicleEvent(
          client,
          vehicle.propertyId,
          `vehicle:${vehicle.id}:registered:${context.idempotencyKey}`,
          'vehicle.registered',
          vehicle.id,
          context,
          { vehicle_id: vehicle.id, status: vehicle.vehicleStatus },
        );
        return vehicle;
      },
    );
  }

  async generateCode(propertyName: string, propertyId: string, date = new Date()): Promise<string> {
    const propertyCode = VehicleCodeGenerator.propertyCode(propertyName);
    const sequence = await this.vehicles.nextSequence(propertyId, date.getFullYear());
    return VehicleCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  async updateVehicle(
    vehicleId: string,
    input: UpdateVehicleInput,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    const patch = { ...input };
    if (patch.plateNumber) {
      patch.plateNumber = VehiclePlateNormalizer.normalize(patch.plateNumber);
    }
    return this.command(context, vehicleId, `/vehicles/${vehicleId}`, patch, async (client) => {
      const current = await this.vehicles.findByIdForUpdate(vehicleId, client);
      if (!current)
        throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
      if (patch.plateNumber)
        await this.assertPlateAvailable(current.propertyId, patch.plateNumber, current.id, client);
      const updated = await this.vehicles.update(current.id, patch, client);
      if (!updated)
        throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
      await this.writeVehicleAudit(VEHICLE_AUDIT_ACTIONS.update, updated, context, current, client);
      await this.writeVehicleEvent(
        client,
        updated.propertyId,
        `vehicle:${updated.id}:updated:${context.idempotencyKey}`,
        'vehicle.updated',
        updated.id,
        context,
        { vehicle_id: updated.id },
      );
      return updated;
    });
  }

  async updateVehicleForUser(
    vehicleId: string,
    userId: string,
    input: UpdateVehicleInput,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    const current = await this.getForUser(vehicleId, userId);
    const hasSensitiveChange = ['plateNumber', 'vehicleType', 'brand', 'color', 'year'].some(
      (field) => Object.prototype.hasOwnProperty.call(input, field),
    );
    if (hasSensitiveChange && current.vehicleStatus !== 'pending_approval') {
      throw new BadRequestException({
        code: 'VEHICLE_UPDATE_REQUIRES_ADMIN_REVIEW',
        message: 'Only pending vehicle registrations can be updated by resident in Phase 1',
      });
    }
    return this.updateVehicle(current.id, input, context);
  }

  approve(vehicleId: string, context: AuditActorContext = {}): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'active', VEHICLE_AUDIT_ACTIONS.approve, context, {
      notes: 'Vehicle approved',
    });
  }

  reject(
    vehicleId: string,
    reason: string,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'rejected', VEHICLE_AUDIT_ACTIONS.reject, context, {
      rejectReason: reason,
      notes: reason,
    });
  }

  suspend(
    vehicleId: string,
    reason: string,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'suspended', VEHICLE_AUDIT_ACTIONS.suspend, context, {
      suspendReason: reason,
      notes: reason,
    });
  }

  reactivate(vehicleId: string, context: AuditActorContext = {}): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'active', VEHICLE_AUDIT_ACTIONS.reactivate, context, {
      notes: 'Vehicle reactivated',
    });
  }

  deactivate(
    vehicleId: string,
    reason: string,
    context: AuditActorContext = {},
  ): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'inactive', VEHICLE_AUDIT_ACTIONS.deactivate, context, {
      deactivationReason: reason,
      notes: reason,
    });
  }

  attachFile(input: CreateVehicleFileInput): Promise<VehicleFileRecord> {
    return this.files.attach(input);
  }

  listFiles(vehicleId: string): Promise<VehicleFileRecord[]> {
    return this.files.list(vehicleId);
  }

  listHistory(vehicleId: string) {
    return this.histories.list(vehicleId);
  }

  summaryForProperties(propertyIds: string[]): Promise<VehicleSummaryRecord> {
    return this.vehicles.summaryForProperties(propertyIds);
  }

  private async transition(
    vehicleId: string,
    toStatus: VehicleStatus,
    auditAction: string,
    context: AuditActorContext,
    options: {
      rejectReason?: string;
      suspendReason?: string;
      deactivationReason?: string;
      notes?: string;
    } = {},
  ): Promise<VehicleRecord> {
    return this.command(
      context,
      vehicleId,
      `/vehicles/${vehicleId}/${auditAction}`,
      { toStatus, ...options },
      async (client) => {
        const current = await this.vehicles.findByIdForUpdate(vehicleId, client);
        if (!current)
          throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
        VehicleStatusTransitionHelper.assertCanTransition(current.vehicleStatus, toStatus);
        const updated = await this.vehicles.transitionStatus(
          current.id,
          toStatus,
          {
            actorUserId: context.actorUserId,
            rejectReason: options.rejectReason,
            suspendReason: options.suspendReason,
            deactivationReason: options.deactivationReason,
          },
          client,
        );
        if (!updated)
          throw new BadRequestException({
            code: 'VEHICLE_TRANSITION_FAILED',
            message: 'Vehicle transition failed',
          });
        await this.histories.record(
          {
            vehicleId: updated.id,
            fromStatus: current.vehicleStatus,
            toStatus,
            actorUserId: context.actorUserId,
            notes: options.notes,
          },
          client,
        );
        await this.writeVehicleAudit(auditAction, updated, context, current, client);
        await this.writeVehicleEvent(
          client,
          updated.propertyId,
          `vehicle:${updated.id}:${auditAction}:${context.idempotencyKey}`,
          `vehicle.${auditAction}`,
          updated.id,
          context,
          { vehicle_id: updated.id, from_status: current.vehicleStatus, to_status: toStatus },
        );
        return updated;
      },
    );
  }

  private async assertPlateAvailable(
    propertyId: string,
    plateNumber: string,
    excludedVehicleId?: string,
    client?: PoolClient,
  ): Promise<void> {
    const exists = await this.vehicles.activePlateExists(
      propertyId,
      plateNumber,
      excludedVehicleId,
      client,
    );
    if (exists) {
      throw new ConflictException({
        code: 'VEHICLE_PLATE_ALREADY_REGISTERED',
        message: 'Plate number is already registered',
      });
    }
  }

  private async writeVehicleAudit(
    action: string,
    vehicle: VehicleRecord,
    context: AuditActorContext,
    before?: VehicleRecord,
    client?: PoolClient,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: context.actorUserId,
        propertyId: vehicle.propertyId,
        action,
        resourceType: 'vehicle',
        resourceId: vehicle.id,
        beforeData: before ? this.auditSnapshot(before) : undefined,
        afterData: this.auditSnapshot(vehicle),
        resultStatus: 'success',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      },
      client,
    );
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
          `SELECT request_fingerprint, command_status, response_body FROM idempotency_commands
           WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3 FOR UPDATE`,
          [actor, route, key],
        );
        const row = existing.rows[0];
        if (!row || row.command_status === 'pending')
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command is still in progress',
          });
        if (row.request_fingerprint !== fingerprint)
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency key was already used with a different payload',
          });
        const stored = row.response_body as { data?: T } | null;
        if (!stored || !Object.prototype.hasOwnProperty.call(stored, 'data'))
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            message: 'Idempotency command has no replayable result',
          });
        return stored.data as T;
      }
      const result = await operation(client);
      await client.query(
        `UPDATE idempotency_commands SET command_status='succeeded', response_status=200,
         response_body=$1::jsonb, completed_at=now()
         WHERE actor_user_id=$2 AND route=$3 AND idempotency_key=$4`,
        [JSON.stringify({ data: result }), actor, route, key],
      );
      return result;
    });
  }

  private async writeVehicleEvent(
    client: PoolClient,
    propertyId: string,
    eventKey: string,
    eventType: string,
    vehicleId: string,
    context: AuditActorContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events(property_id,event_key,event_type,aggregate_type,aggregate_id,payload,correlation_id,actor_user_id)
       VALUES($1,$2,$3,'vehicle',$4,$5::jsonb,$6,$7) ON CONFLICT(event_key) DO NOTHING`,
      [
        propertyId,
        eventKey,
        eventType,
        vehicleId,
        JSON.stringify(payload),
        context.correlationId ?? null,
        context.actorUserId ?? null,
      ],
    );
  }

  private auditSnapshot(vehicle: VehicleRecord): Record<string, unknown> {
    return {
      id: vehicle.id,
      vehicleCode: vehicle.vehicleCode,
      vehicleType: vehicle.vehicleType,
      vehicleStatus: vehicle.vehicleStatus,
      residentId: vehicle.residentId,
    };
  }
}
