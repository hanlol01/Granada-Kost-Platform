import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../../infrastructure/audit/audit.repository';
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

type RegisterVehicleInput = Omit<CreateVehicleInput, 'plateNumber' | 'vehicleStatus' | 'approvedByUserId'> & {
  plateNumber: string;
  adminCreated?: boolean;
};

@Injectable()
export class VehicleService {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly histories: VehicleStatusHistoryRepository,
    private readonly files: VehicleFileRepository,
    private readonly audit: AuditRepository,
  ) {}

  list(propertyId: string, status?: VehicleStatus, vehicleType?: VehicleType, limit?: number, offset?: number): Promise<VehicleRecord[]> {
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
    const context = await this.vehicles.activeContextForUser(userId);
    if (!context) {
      throw new BadRequestException({ code: 'ACTIVE_OCCUPANCY_NOT_FOUND', message: 'Active occupancy not found for resident' });
    }
    return context;
  }

  async registerVehicle(input: RegisterVehicleInput, context: AuditActorContext = {}): Promise<VehicleRecord> {
    const settings = await this.vehicles.settings(input.propertyId);
    const maxVehicles = settings?.maxVehiclesPerResident ?? 3;
    const activeVehicleCount = await this.vehicles.nonTerminalCountForResident(input.propertyId, input.residentId);
    if (activeVehicleCount >= maxVehicles) {
      throw new BadRequestException({ code: 'VEHICLE_LIMIT_REACHED', message: 'Resident has reached vehicle limit' });
    }

    const plateNumber = VehiclePlateNormalizer.normalize(input.plateNumber);
    await this.assertPlateAvailable(input.propertyId, plateNumber);

    const vehicleStatus: VehicleStatus = input.adminCreated || settings?.parkingRequiresApproval === false ? 'active' : 'pending_approval';
    const vehicle = await this.vehicles.create({
      ...input,
      plateNumber,
      vehicleStatus,
      approvedByUserId: vehicleStatus === 'active' ? context.actorUserId : undefined,
    });

    await this.histories.record({
      vehicleId: vehicle.id,
      fromStatus: null,
      toStatus: vehicle.vehicleStatus,
      actorUserId: context.actorUserId,
      notes: vehicle.vehicleStatus === 'active' ? 'Vehicle registered as active' : 'Vehicle registration submitted',
    });
    await this.writeVehicleAudit(VEHICLE_AUDIT_ACTIONS.create, vehicle, context);
    return vehicle;
  }

  async generateCode(propertyName: string, propertyId: string, date = new Date()): Promise<string> {
    const propertyCode = VehicleCodeGenerator.propertyCode(propertyName);
    const sequence = await this.vehicles.nextSequence(propertyId, date.getFullYear());
    return VehicleCodeGenerator.format(propertyCode, date.getFullYear(), sequence);
  }

  async updateVehicle(vehicleId: string, input: UpdateVehicleInput, context: AuditActorContext = {}): Promise<VehicleRecord> {
    const current = await this.get(vehicleId);
    const patch = { ...input };
    if (patch.plateNumber) {
      patch.plateNumber = VehiclePlateNormalizer.normalize(patch.plateNumber);
      await this.assertPlateAvailable(current.propertyId, patch.plateNumber, current.id);
    }

    const updated = await this.vehicles.update(current.id, patch);
    if (!updated) {
      throw new NotFoundException({ code: 'VEHICLE_NOT_FOUND', message: 'Vehicle not found' });
    }
    await this.writeVehicleAudit(VEHICLE_AUDIT_ACTIONS.update, updated, context, current);
    return updated;
  }

  async updateVehicleForUser(vehicleId: string, userId: string, input: UpdateVehicleInput, context: AuditActorContext = {}): Promise<VehicleRecord> {
    const current = await this.getForUser(vehicleId, userId);
    const hasSensitiveChange = ['plateNumber', 'vehicleType', 'brand', 'color', 'year'].some((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
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

  reject(vehicleId: string, reason: string, context: AuditActorContext = {}): Promise<VehicleRecord> {
    return this.transition(vehicleId, 'rejected', VEHICLE_AUDIT_ACTIONS.reject, context, {
      rejectReason: reason,
      notes: reason,
    });
  }

  suspend(vehicleId: string, reason: string, context: AuditActorContext = {}): Promise<VehicleRecord> {
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

  deactivate(vehicleId: string, reason: string, context: AuditActorContext = {}): Promise<VehicleRecord> {
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
    const current = await this.get(vehicleId);
    VehicleStatusTransitionHelper.assertCanTransition(current.vehicleStatus, toStatus);

    const updated = await this.vehicles.transitionStatus(current.id, toStatus, {
      actorUserId: context.actorUserId,
      rejectReason: options.rejectReason,
      suspendReason: options.suspendReason,
      deactivationReason: options.deactivationReason,
    });
    if (!updated) {
      throw new BadRequestException({ code: 'VEHICLE_TRANSITION_FAILED', message: 'Vehicle transition failed' });
    }

    await this.histories.record({
      vehicleId: updated.id,
      fromStatus: current.vehicleStatus,
      toStatus,
      actorUserId: context.actorUserId,
      notes: options.notes,
    });
    await this.writeVehicleAudit(auditAction, updated, context, current);
    return updated;
  }

  private async assertPlateAvailable(propertyId: string, plateNumber: string, excludedVehicleId?: string): Promise<void> {
    const exists = await this.vehicles.activePlateExists(propertyId, plateNumber, excludedVehicleId);
    if (exists) {
      throw new ConflictException({ code: 'VEHICLE_PLATE_ALREADY_REGISTERED', message: 'Plate number is already registered' });
    }
  }

  private async writeVehicleAudit(
    action: string,
    vehicle: VehicleRecord,
    context: AuditActorContext,
    before?: VehicleRecord,
  ): Promise<void> {
    await this.audit.write({
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
    });
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
