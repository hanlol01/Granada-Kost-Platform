import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { UpdateSmartLockDeviceDto } from '../dto/update-smart-lock-device.dto';
import { SmartLockRateLimitHelper } from '../helpers/smart-lock-rate-limit.helper';
import { SmartLockDeviceService } from '../services/smart-lock-device.service';
import {
  auditContext,
  scopedPropertyIds,
  toSmartLockDeviceResponse,
  toSmartLockDiagnosticResponse,
} from './smart-lock-controller.util';

@UseGuards(JwtAuthGuard, RbacGuard)
@RequireRoles('owner', 'manager', 'admin')
@Controller('smart-lock/devices')
export class SmartLockDeviceController {
  constructor(
    private readonly devices: SmartLockDeviceService,
    private readonly properties: PropertyService,
    private readonly rooms: RoomService,
    private readonly rateLimit: SmartLockRateLimitHelper,
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
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return this.devices.syncStatus(deviceId, auditContext(user, request));
  }

  @Post(':deviceId/decommission')
  @RequirePermissions('smart_lock.manage')
  async decommission(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    return toSmartLockDeviceResponse(await this.devices.decommission(deviceId, auditContext(user, request)));
  }

  @Post(':deviceId/lock')
  @RequirePermissions('smart_lock.command')
  commandLock(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    return this.executeCommand(user, deviceId, request, 'lock');
  }

  @Post(':deviceId/unlock')
  @RequirePermissions('smart_lock.command')
  commandUnlock(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    return this.executeCommand(user, deviceId, request, 'unlock');
  }

  @Post(':deviceId/emergency-unlock')
  @RequirePermissions('smart_lock.command')
  commandEmergencyUnlock(@CurrentUser() user: UserAccessContext, @Param('deviceId') deviceId: string, @Req() request: RequestWithCorrelationId) {
    return this.executeCommand(user, deviceId, request, 'emergency_unlock');
  }

  @Post(':deviceId/normal-open-mode')
  @RequireRoles('owner', 'manager')
  @RequirePermissions('smart_lock.command')
  async normalOpenMode(
    @CurrentUser() user: UserAccessContext,
    @Param('deviceId') deviceId: string,
    @Body() dto: NormalOpenModeDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.executeCommand(user, deviceId, request, dto.enabled ? 'normal_open_mode_on' : 'normal_open_mode_off');
  }

  private async executeCommand(
    user: UserAccessContext,
    deviceId: string,
    request: RequestWithCorrelationId,
    action: 'lock' | 'unlock' | 'emergency_unlock' | 'normal_open_mode_on' | 'normal_open_mode_off',
  ) {
    const device = await this.devices.get(deviceId);
    await this.properties.assertCanReadProperty(user, device.propertyId);
    const rate = await this.rateLimit.consumeCommandAttempt(device.id, user.id);
    if (!rate.allowed) {
      return { accepted: false, result_status: 'denied', reason: 'SMART_LOCK_COMMAND_RATE_LIMITED', remaining: rate.remaining };
    }
    return this.devices.executeCommand(deviceId, action, {
      source: action === 'emergency_unlock' ? 'emergency_override' : 'admin_dashboard',
      context: auditContext(user, request),
    });
  }
}
