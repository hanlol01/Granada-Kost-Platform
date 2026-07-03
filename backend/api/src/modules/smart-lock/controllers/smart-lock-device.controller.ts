import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../../shared/types/request-with-correlation-id';
import { UserAccessContext } from '../../iam/types/iam.types';
import { PropertyService } from '../../property/property.service';
import { RoomService } from '../../room/room.service';
import { CurrentUser } from '../../rbac/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/decorators/permissions.decorator';
import { RequireRoles } from '../../rbac/decorators/roles.decorator';
import { JwtAuthGuard } from '../../rbac/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { CreateSmartLockDeviceDto } from '../dto/create-smart-lock-device.dto';
import { ListSmartLockDevicesQueryDto } from '../dto/list-smart-lock-devices-query.dto';
import { NormalOpenModeDto } from '../dto/normal-open-mode.dto';
import { SmartLockCommandRequestDto } from '../dto/smart-lock-command-request.dto';
import { UpdateSmartLockDeviceDto } from '../dto/update-smart-lock-device.dto';
import { SmartLockCommandGuardService, SmartLockControlledCommandType } from '../services/smart-lock-command-guard.service';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import {
  auditContext,
  scopedPropertyIds,
  toSmartLockDeviceResponse,
  toSmartLockDiagnosticResponse,
  toSmartLockSyncResponse,
} from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('smart-lock/devices')
export class SmartLockDeviceController {
  constructor(
    private readonly devices: SmartLockDeviceService,
    private readonly properties: PropertyService,
    private readonly rooms: RoomService,
    private readonly commandGuard: SmartLockCommandGuardService,
  ) {}

  @Get()
  @RequirePermissions('smart_lock.read')
  async list(@CurrentUser() user: UserAccessContext, @Query() query: ListSmartLockDevicesQueryDto) {
    const propertyIds = await scopedPropertyIds(this.properties, user, query.property_id);
    const records = [];
    for (const propertyId of propertyIds) {
      records.push(...(await this.devices.list(propertyId, query.status, query.limit, query.offset)));
    }
    return records.map((device) => toSmartLockDeviceResponse(device));
  }

  @Get(':deviceId')
  @RequirePermissions('smart_lock.read')
  async get(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockDeviceResponse(device);
  }

  @Get(':deviceId/diagnostics')
  @RequirePermissions('smart_lock.read')
  async diagnostics(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockDiagnosticResponse(await this.devices.readDiagnostics(device, auditContext(user, request)));
  }

  @Post()
  @RequirePermissions('smart_lock.manage')
  async create(@CurrentUser() user: UserAccessContext, @Body() dto: CreateSmartLockDeviceDto, @Req() request: RequestWithCorrelationId) {
    await this.properties.assertCanReadProperty(user, dto.property_id);
    const room = await this.rooms.getRoom(user, dto.room_id);
    if (room.propertyId !== dto.property_id) {
      throw new BadRequestException({ code: 'ROOM_PROPERTY_MISMATCH', message: 'Room is not in selected property' });
    }
    const device = await this.devices.registerDevice(
      {
        propertyId: dto.property_id,
        roomId: dto.room_id,
        deviceName: dto.device_name,
        tuyaDeviceId: dto.tuya_device_id,
        model: dto.model,
      },
      auditContext(user, request),
    );
    return toSmartLockDeviceResponse(device);
  }

  @Patch(':deviceId')
  @RequirePermissions('smart_lock.manage')
  async update(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateSmartLockDeviceDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    const updated = await this.devices.updateStatus(
      deviceId,
      {
        deviceName: dto.device_name,
        model: dto.model,
        connectionStatus: dto.connection_status,
        lockState: dto.lock_state,
        deviceStatus: dto.device_status,
        batteryPercent: dto.battery_percent,
        firmwareVersion: dto.firmware_version,
        autoLockEnabled: dto.auto_lock_enabled,
        autoLockDelaySeconds: dto.auto_lock_delay_seconds,
      },
      auditContext(user, request),
    );
    return toSmartLockDeviceResponse(updated);
  }

  @Post(':deviceId/sync-status')
  @RequirePermissions('smart_lock.manage')
  async syncStatus(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    return this.syncReadOnlyDevice(user, deviceId, request);
  }

  @Post(':deviceId/sync-readonly')
  @RequirePermissions('smart_lock.manage')
  async syncReadOnly(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    return this.syncReadOnlyDevice(user, deviceId, request);
  }

  @Post(':deviceId/decommission')
  @RequirePermissions('smart_lock.manage')
  async decommission(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockDeviceResponse(await this.devices.decommission(deviceId, auditContext(user, request)));
  }

  @Post(':deviceId/commands')
  @RequireRoles('manager', 'admin')
  @RequirePermissions('smart_lock.manage')
  async controlledCommand(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: SmartLockCommandRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeControlledCommand(user, deviceId, request, dto, this.normalizeCommandType(dto), idempotencyKey);
  }

  @Post(':deviceId/lock')
  @RequireRoles('manager', 'admin')
  @RequirePermissions('smart_lock.manage')
  commandLock(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: SmartLockCommandRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeControlledCommand(user, deviceId, request, dto, 'remote_lock', idempotencyKey);
  }

  @Post(':deviceId/unlock')
  @RequireRoles('manager', 'admin')
  @RequirePermissions('smart_lock.manage')
  commandUnlock(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: SmartLockCommandRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeControlledCommand(user, deviceId, request, dto, 'remote_unlock', idempotencyKey);
  }

  @Post(':deviceId/emergency-unlock')
  @RequireRoles('manager', 'admin')
  @RequirePermissions('smart_lock.manage')
  commandEmergencyUnlock(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: SmartLockCommandRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeControlledCommand(user, deviceId, request, dto, 'emergency_unlock', idempotencyKey);
  }

  @Post(':deviceId/normal-open-mode')
  @RequireRoles('manager', 'admin')
  @RequirePermissions('smart_lock.manage')
  async normalOpenMode(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: NormalOpenModeDto & SmartLockCommandRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | string[] | undefined,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeControlledCommand(user, deviceId, request, dto, this.normalizeCommandType({ action: 'normal_open_mode' }), idempotencyKey);
  }

  private async executeControlledCommand(
    user: UserAccessContext,
    deviceId: string,
    request: RequestWithCorrelationId,
    dto: SmartLockCommandRequestDto,
    commandType: SmartLockControlledCommandType,
    rawIdempotencyKey: string | string[] | undefined,
  ) {
    this.assertCommandRequest(dto, rawIdempotencyKey);
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);

    return this.commandGuard.execute({
      device,
      actor: user,
      commandType,
      reason: dto.reason!.trim(),
      confirmed: true,
      emergency: Boolean(dto.emergency) || commandType === 'emergency_unlock',
      idempotencyKey: this.idempotencyKey(rawIdempotencyKey),
      context: auditContext(user, request),
    });
  }

  private async syncReadOnlyDevice(user: UserAccessContext, deviceId: string, request: RequestWithCorrelationId) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockSyncResponse(await this.devices.syncStatus(device, auditContext(user, request)));
  }

  private assertCommandRequest(dto: SmartLockCommandRequestDto, rawIdempotencyKey: string | string[] | undefined): void {
    if (dto.confirmed !== true) {
      throw new BadRequestException({
        code: 'SMART_LOCK_CONFIRMATION_REQUIRED',
        message: 'Smart Lock command requires explicit confirmation',
      });
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException({
        code: 'SMART_LOCK_REASON_REQUIRED',
        message: 'Smart Lock command requires a reason',
      });
    }

    if (!this.idempotencyKey(rawIdempotencyKey)) {
      throw new BadRequestException({
        code: 'SMART_LOCK_IDEMPOTENCY_KEY_REQUIRED',
        message: 'Smart Lock command requires an Idempotency-Key header',
      });
    }
  }

  private normalizeCommandType(dto: Pick<SmartLockCommandRequestDto, 'command_type' | 'action'>): SmartLockControlledCommandType {
    const raw = (dto.command_type ?? dto.action ?? '').trim();
    if (raw === 'remote_unlock' || raw === 'unlock') {
      return 'remote_unlock';
    }
    if (raw === 'emergency_unlock') {
      return 'emergency_unlock';
    }
    if (raw === 'remote_lock' || raw === 'lock') {
      return 'remote_lock';
    }
    throw new BadRequestException({
      code: 'UNSUPPORTED_CAPABILITY',
      message: 'Smart Lock command type is unsupported',
    });
  }

  private idempotencyKey(raw: string | string[] | undefined): string {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ?? '';
  }
}
