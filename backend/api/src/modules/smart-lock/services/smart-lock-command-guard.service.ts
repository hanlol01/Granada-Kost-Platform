import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { UserAccessContext } from '../../iam/types/iam.types';
import { SMART_LOCK_AUDIT_ACTIONS, SMART_LOCK_DEFAULTS } from '../constants/smart-lock.constants';
import { SmartLockGatewayResult } from '../gateways/smart-lock-gateway.interface';
import { SmartLockRateLimitHelper } from '../helpers/smart-lock-rate-limit.helper';
import { SmartLockDeviceGatewayRepository } from '../runtime/repositories/smart-lock-device-gateway.repository';
import { SmartLockGatewayCredentialRepository } from '../runtime/repositories/smart-lock-gateway-credential.repository';
import { SmartLockGatewayHealthRepository } from '../runtime/repositories/smart-lock-gateway-health.repository';
import { SmartLockGatewayRepository } from '../runtime/repositories/smart-lock-gateway.repository';
import { SmartLockTuyaConfigService } from '../runtime/providers/tuya/smart-lock-tuya-config.service';
import { SmartLockGatewayRecord, SmartLockGatewayHealthRecord } from '../runtime/types/smart-lock-runtime.types';
import { SmartLockRuntimeService } from '../runtime/services/smart-lock-runtime.service';
import { SmartLockSecretResolutionService } from '../runtime/services/smart-lock-secret-resolution.service';
import {
  SmartLockAccessAction,
  SmartLockAccessResult,
  SmartLockAuditContext,
  SmartLockDeviceRecord,
} from '../types/smart-lock.types';
import { SmartLockAuditService } from './smart-lock-audit.service';

export type SmartLockControlledCommandType = 'remote_unlock' | 'emergency_unlock' | 'remote_lock';

export type SmartLockCommandResponse = {
  accepted: boolean;
  command_id?: string;
  command_type: SmartLockControlledCommandType;
  provider: 'tuya' | 'simulated';
  result_status: 'success' | 'failed' | 'queued' | 'device_offline' | 'timeout';
  error_code?: string;
  error_message?: string;
  idempotency_replayed: boolean;
  timestamp: string;
  correlation_id?: string;
};

type ExecuteGuardedCommandInput = {
  device: SmartLockDeviceRecord;
  actor: UserAccessContext;
  commandType: SmartLockControlledCommandType;
  reason: string;
  confirmed: true;
  emergency: boolean;
  idempotencyKey: string;
  context: SmartLockAuditContext;
};

type IdempotencyRecord = {
  state: 'in_flight' | 'completed';
  createdAt: string;
  commandType: SmartLockControlledCommandType;
  correlationId?: string;
  response?: SmartLockCommandResponse;
};

type IdempotencyBeginResult =
  | { kind: 'started'; key: string; keyHash: string; keyRef: string }
  | { kind: 'replayed'; key: string; keyHash: string; keyRef: string; response: SmartLockCommandResponse }
  | { kind: 'in_flight'; key: string; keyHash: string; keyRef: string; response: SmartLockCommandResponse }
  | { kind: 'unavailable'; keyHash: string; keyRef: string };

@Injectable()
export class SmartLockCommandGuardService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly tuyaConfig: SmartLockTuyaConfigService,
    private readonly deviceGateways: SmartLockDeviceGatewayRepository,
    private readonly gateways: SmartLockGatewayRepository,
    private readonly gatewayCredentials: SmartLockGatewayCredentialRepository,
    private readonly gatewayHealth: SmartLockGatewayHealthRepository,
    private readonly secrets: SmartLockSecretResolutionService,
    private readonly rateLimit: SmartLockRateLimitHelper,
    private readonly runtime: SmartLockRuntimeService,
    private readonly audit: SmartLockAuditService,
  ) {}

  async execute(input: ExecuteGuardedCommandInput): Promise<SmartLockCommandResponse> {
    const idempotency = await this.beginIdempotency(input);
    if (idempotency.kind === 'replayed' || idempotency.kind === 'in_flight') {
      await this.writeReplayAudit(input, idempotency.keyRef, idempotency.response);
      return {
        ...idempotency.response,
        idempotency_replayed: true,
      };
    }

    if (idempotency.kind === 'unavailable') {
      const response = this.failure(input, 'UNKNOWN_PROVIDER_ERROR', 'Command idempotency guard is unavailable.');
      await this.writeCommandResult(input, response, idempotency.keyRef);
      return response;
    }

    const response = await this.executeFresh(input, idempotency.keyRef);
    await this.completeIdempotency(idempotency.key, response);
    return response;
  }

  private async executeFresh(input: ExecuteGuardedCommandInput, idempotencyKeyRef: string): Promise<SmartLockCommandResponse> {
    const rate = await this.rateLimit.consumeControlledCommandAttempt({
      propertyId: input.device.propertyId,
      deviceId: input.device.id,
      actorUserId: input.actor.id,
      commandType: input.commandType,
      emergency: input.emergency,
    });
    if (!rate.redisAvailable) {
      const response = this.failure(input, 'RATE_LIMITED', 'Smart Lock command rate-limit guard is unavailable.');
      await this.writeCommandResult(input, response, idempotencyKeyRef, { rateLimitKey: rate.key, rateLimitRedisAvailable: false });
      return response;
    }
    if (!rate.allowed) {
      const response = this.failure(input, 'RATE_LIMITED', 'Smart Lock command rate limit exceeded.');
      await this.writeCommandResult(input, response, idempotencyKeyRef, {
        rateLimitKey: rate.key,
        rateLimitRemaining: rate.remaining,
        rateLimitMax: rate.limit,
      });
      return response;
    }

    const gateFailure = await this.evaluatePreProviderGates(input);
    if (gateFailure) {
      await this.writeCommandResult(input, gateFailure.response, idempotencyKeyRef, gateFailure.metadata);
      return gateFailure.response;
    }

    const intentWritten = await this.writeIntentAudit(input, idempotencyKeyRef);
    if (!intentWritten) {
      const response = this.failure(input, 'UNKNOWN_PROVIDER_ERROR', 'Smart Lock command audit intent could not be recorded.');
      await this.writeCommandResult(input, response, idempotencyKeyRef);
      return response;
    }

    const providerResult = await this.runtime.executeCommand(input.device, this.toRuntimeAction(input.commandType), input.context.correlationId);
    const response = this.fromProviderResult(input, providerResult);
    await this.writeCommandResult(input, response, idempotencyKeyRef, {
      gatewayId: safeString(providerResult.data, 'gatewayId'),
      providerRequestId: providerResult.providerRequestId,
      retryable: safeBoolean(providerResult.data, 'retryable'),
      failoverReason: safeString(providerResult.data, 'failoverReason'),
    });
    return response;
  }

  private async evaluatePreProviderGates(
    input: ExecuteGuardedCommandInput,
  ): Promise<{ response: SmartLockCommandResponse; metadata?: Record<string, unknown> } | null> {
    if (!this.tuyaConfig.isTuyaSelected()) {
      return {
        response: this.failure(input, 'LIVE_COMMAND_DISABLED', 'Live command is disabled.', 'simulated'),
        metadata: { gate: 'SMART_LOCK_PROVIDER', providerMode: this.tuyaConfig.selection },
      };
    }

    if (!this.tuyaConfig.liveEnabled) {
      return {
        response: this.failure(input, 'LIVE_COMMAND_DISABLED', 'Live command is disabled.', 'tuya'),
        metadata: { gate: 'SMART_LOCK_LIVE_ENABLED' },
      };
    }

    const mapping = await this.deviceGateways.findActiveForDevice(input.device.id);
    if (!mapping) {
      return {
        response: this.failure(input, 'DEVICE_NOT_MAPPED', 'Smart Lock device has no active gateway mapping.', 'tuya'),
        metadata: { gate: 'DEVICE_GATEWAY_MAPPING' },
      };
    }

    const gateway = await this.gateways.findById(mapping.gatewayId);
    if (!gateway) {
      return {
        response: this.failure(input, 'DEVICE_NOT_MAPPED', 'Smart Lock gateway mapping is invalid.', 'tuya'),
        metadata: { gate: 'GATEWAY_MAPPING_INTEGRITY', mappingId: mapping.id },
      };
    }

    if (gateway.gatewayStatus !== 'active') {
      return {
        response: this.failure(input, 'LIVE_COMMAND_DISABLED', 'Smart Lock command safety mode is locked down.', 'tuya'),
        metadata: { gate: 'GATEWAY_STATUS', gatewayId: gateway.id, gatewayStatus: gateway.gatewayStatus },
      };
    }

    if (!this.gatewaySupports(gateway, input.commandType)) {
      return {
        response: this.failure(input, 'UNSUPPORTED_CAPABILITY', 'Smart Lock gateway does not support this command.', 'tuya'),
        metadata: { gate: 'COMMAND_CAPABILITY', gatewayId: gateway.id },
      };
    }

    const configFailure = await this.providerConfigFailure(input, gateway);
    if (configFailure) {
      return { response: configFailure, metadata: { gate: 'PROVIDER_CONFIG', gatewayId: gateway.id } };
    }

    const health = await this.gatewayHealth.find(gateway.id);
    if (!this.deviceStateAcceptable(input.device, health)) {
      return {
        response: this.failure(input, 'DEVICE_OFFLINE', 'Smart Lock device is offline or has no recent acceptable sync.', 'tuya'),
        metadata: { gate: 'DEVICE_ONLINE_OR_RECENT_SYNC', gatewayId: gateway.id, healthStatus: health?.healthStatus },
      };
    }

    return null;
  }

  private async providerConfigFailure(input: ExecuteGuardedCommandInput, gateway: SmartLockGatewayRecord): Promise<SmartLockCommandResponse | null> {
    const baseUrl = this.tuyaConfig.resolveBaseUrl();
    if (!baseUrl) {
      return this.failure(input, 'CONFIG_MISSING', 'Tuya provider configuration is incomplete.', 'tuya');
    }

    const credential = await this.gatewayCredentials.findActiveForGateway(gateway.id);
    const secretRef = this.secrets.resolve(gateway, credential);
    if (!this.secrets.resolveTuyaCredentials(secretRef)) {
      return this.failure(input, 'CONFIG_MISSING', 'Tuya provider credentials are incomplete.', 'tuya');
    }

    return null;
  }

  private gatewaySupports(gateway: SmartLockGatewayRecord, commandType: SmartLockControlledCommandType): boolean {
    const capability = commandType === 'remote_lock' ? 'lock' : commandType;
    return Boolean(gateway.capabilities[capability] ?? true);
  }

  private deviceStateAcceptable(device: SmartLockDeviceRecord, health: SmartLockGatewayHealthRecord | null): boolean {
    if (device.connectionStatus === 'online') {
      return true;
    }
    if (device.connectionStatus === 'offline') {
      return false;
    }

    const staleAfterMs = this.syncStalenessMinutes() * 60 * 1000;
    const cutoff = Date.now() - staleAfterMs;
    const deviceSyncAcceptable = Boolean(device.lastSyncedAt && device.lastSyncedAt.getTime() >= cutoff);
    const gatewayHealthAcceptable = Boolean(
      health?.lastSuccessAt &&
        health.lastSuccessAt.getTime() >= cutoff &&
        health.healthStatus !== 'unhealthy' &&
        health.errorCode !== 'DEVICE_OFFLINE',
    );
    return deviceSyncAcceptable || gatewayHealthAcceptable;
  }

  private fromProviderResult(input: ExecuteGuardedCommandInput, result: SmartLockGatewayResult): SmartLockCommandResponse {
    return {
      accepted: result.success && (result.resultStatus === 'success' || result.resultStatus === 'queued'),
      command_type: input.commandType,
      provider: result.provider,
      result_status: result.resultStatus,
      error_code: result.errorCode,
      error_message: result.errorMessage ?? (result.errorCode ? this.safeErrorMessage(result.errorCode) : undefined),
      idempotency_replayed: false,
      timestamp: new Date().toISOString(),
      correlation_id: input.context.correlationId,
    };
  }

  private failure(
    input: ExecuteGuardedCommandInput,
    errorCode: string,
    errorMessage: string,
    provider: 'tuya' | 'simulated' = this.tuyaConfig.isTuyaSelected() ? 'tuya' : 'simulated',
  ): SmartLockCommandResponse {
    return {
      accepted: false,
      command_type: input.commandType,
      provider,
      result_status: errorCode === 'DEVICE_OFFLINE' ? 'device_offline' : 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      idempotency_replayed: false,
      timestamp: new Date().toISOString(),
      correlation_id: input.context.correlationId,
    };
  }

  private async writeIntentAudit(input: ExecuteGuardedCommandInput, idempotencyKeyRef: string): Promise<boolean> {
    try {
      await this.audit.writeDomainAudit({
        action: SMART_LOCK_AUDIT_ACTIONS.controlledCommandIntent,
        resourceType: 'smart_lock_device',
        resourceId: input.device.id,
        propertyId: input.device.propertyId,
        afterData: this.auditPayload(input, idempotencyKeyRef, { intent: true }),
        resultStatus: 'success',
        context: input.context,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async writeReplayAudit(
    input: ExecuteGuardedCommandInput,
    idempotencyKeyRef: string,
    response: SmartLockCommandResponse,
  ): Promise<void> {
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.controlledCommandResult,
      resourceType: 'smart_lock_device',
      resourceId: input.device.id,
      propertyId: input.device.propertyId,
      afterData: this.auditPayload(input, idempotencyKeyRef, {
        idempotencyReplayed: true,
        originalCorrelationId: response.correlation_id,
        resultStatus: response.result_status,
        errorCode: response.error_code,
      }),
      resultStatus: 'success',
      context: input.context,
    });
  }

  private async writeCommandResult(
    input: ExecuteGuardedCommandInput,
    response: SmartLockCommandResponse,
    idempotencyKeyRef: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.writeDomainAudit({
      action: SMART_LOCK_AUDIT_ACTIONS.controlledCommandResult,
      resourceType: 'smart_lock_device',
      resourceId: input.device.id,
      propertyId: input.device.propertyId,
      afterData: this.auditPayload(input, idempotencyKeyRef, {
        provider: response.provider,
        resultStatus: response.result_status,
        errorCode: response.error_code,
        ...extra,
      }),
      resultStatus: response.accepted ? 'success' : response.error_code === 'RATE_LIMITED' ? 'denied' : 'failed',
      context: input.context,
    });

    const accessLog = await this.audit.writeAccessLog(input.device, {
      residentId: null,
      actorUserId: input.actor.id,
      actionType: this.toAccessLogAction(input.commandType),
      source: input.commandType === 'emergency_unlock' || input.emergency ? 'emergency_override' : 'admin_dashboard',
      trigger: 'manual',
      resultStatus: this.toAccessLogResult(response),
      failureReason: response.error_code ?? null,
      credentialTypeUsed: 'remote',
      ipAddress: input.context.ipAddress ?? null,
      userAgent: input.context.userAgent ?? null,
      correlationId: input.context.correlationId ?? null,
      metadata: {
        provider: response.provider,
        commandType: input.commandType,
        emergency: input.emergency,
        confirmed: input.confirmed,
        reason: input.reason,
        idempotencyKeyRef,
        idempotencyReplayed: response.idempotency_replayed,
        ...extra,
      },
    });
    response.command_id = accessLog.id;
  }

  private auditPayload(input: ExecuteGuardedCommandInput, idempotencyKeyRef: string, extra: Record<string, unknown>): Record<string, unknown> {
    return {
      actorId: input.actor.id,
      actorRoles: input.actor.roles,
      propertyId: input.device.propertyId,
      deviceId: input.device.id,
      commandType: input.commandType,
      reason: input.reason,
      confirmation: input.confirmed,
      emergency: input.emergency,
      idempotencyKeyRef,
      correlationId: input.context.correlationId,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }

  private async beginIdempotency(input: ExecuteGuardedCommandInput): Promise<IdempotencyBeginResult> {
    const keyHash = this.idempotencyScopeHash(input);
    const keyRef = keyHash.slice(0, 16);
    const key = `smart-lock:command:idempotency:${keyHash}`;
    const client = this.redis.client;
    const ttlSeconds = this.idempotencyTtlSeconds();
    const pending: IdempotencyRecord = {
      state: 'in_flight',
      createdAt: new Date().toISOString(),
      commandType: input.commandType,
      correlationId: input.context.correlationId,
    };

    try {
      if (client.status === 'wait') {
        await client.connect();
      }
      const created = await client.set(key, JSON.stringify(pending), 'EX', ttlSeconds, 'NX');
      if (created === 'OK') {
        return { kind: 'started', key, keyHash, keyRef };
      }

      const existing = await client.get(key);
      if (!existing) {
        return { kind: 'unavailable', keyHash, keyRef };
      }
      const record = JSON.parse(existing) as IdempotencyRecord;
      if (record.state === 'completed' && record.response) {
        return { kind: 'replayed', key, keyHash, keyRef, response: record.response };
      }

      return {
        kind: 'in_flight',
        key,
        keyHash,
        keyRef,
        response: {
          accepted: true,
          command_type: input.commandType,
          provider: this.tuyaConfig.isTuyaSelected() ? 'tuya' : 'simulated',
          result_status: 'queued',
          idempotency_replayed: true,
          timestamp: record.createdAt,
          correlation_id: record.correlationId ?? input.context.correlationId,
        },
      };
    } catch {
      return { kind: 'unavailable', keyHash, keyRef };
    }
  }

  private async completeIdempotency(key: string, response: SmartLockCommandResponse): Promise<void> {
    const record: IdempotencyRecord = {
      state: 'completed',
      createdAt: response.timestamp,
      commandType: response.command_type,
      correlationId: response.correlation_id,
      response: {
        ...response,
        idempotency_replayed: false,
      },
    };
    const client = this.redis.client;
    await client.set(key, JSON.stringify(record), 'EX', this.idempotencyTtlSeconds());
  }

  private idempotencyScopeHash(input: ExecuteGuardedCommandInput): string {
    return sha256([input.actor.id, input.device.propertyId, input.device.id, input.commandType, input.idempotencyKey].join('|'));
  }

  private toRuntimeAction(commandType: SmartLockControlledCommandType): SmartLockAccessAction {
    if (commandType === 'remote_lock') {
      return 'lock';
    }
    return commandType;
  }

  private toAccessLogAction(commandType: SmartLockControlledCommandType): SmartLockAccessAction {
    return commandType === 'remote_lock' ? 'lock' : commandType;
  }

  private toAccessLogResult(response: SmartLockCommandResponse): SmartLockAccessResult {
    if (response.accepted) {
      return response.result_status === 'queued' ? 'queued' : 'success';
    }
    if (response.result_status === 'timeout' || response.result_status === 'device_offline') {
      return response.result_status;
    }
    if (response.error_code === 'RATE_LIMITED' || response.error_code === 'LIVE_COMMAND_DISABLED' || response.error_code === 'UNSUPPORTED_CAPABILITY') {
      return 'denied';
    }
    return 'failed';
  }

  private idempotencyTtlSeconds(): number {
    const configured = this.config.get<number>('smartLock.commandIdempotencyTtlSeconds');
    return this.safePositiveInteger(configured, SMART_LOCK_DEFAULTS.commandIdempotencyTtlSeconds);
  }

  private syncStalenessMinutes(): number {
    const configured = this.config.get<number>('smartLock.commandSyncStalenessMinutes');
    return this.safePositiveInteger(configured, SMART_LOCK_DEFAULTS.commandSyncStalenessMinutes);
  }

  private safePositiveInteger(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private safeErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
      CONFIG_MISSING: 'Tuya provider configuration is incomplete.',
      DEVICE_NOT_MAPPED: 'Smart Lock device has no active gateway mapping.',
      DEVICE_OFFLINE: 'Smart Lock device is offline or has no recent acceptable sync.',
      RATE_LIMITED: 'Smart Lock command rate limit exceeded.',
      LIVE_COMMAND_DISABLED: 'Live command is disabled.',
      UNSUPPORTED_CAPABILITY: 'Smart Lock command is unsupported.',
      UNKNOWN_PROVIDER_ERROR: 'Smart Lock command failed safely.',
    };
    return messages[errorCode] ?? 'Smart Lock command failed safely.';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeString(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function safeBoolean(data: unknown, key: string): boolean | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : undefined;
}
