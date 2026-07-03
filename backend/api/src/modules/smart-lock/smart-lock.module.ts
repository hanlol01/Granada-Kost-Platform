import { Module } from '@nestjs/common';
import { AuditModule } from '../../infrastructure/audit/audit.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { PropertyModule } from '../property/property.module';
import { RbacModule } from '../rbac/rbac.module';
import { ResidentModule } from '../resident/resident.module';
import { RoomModule } from '../room/room.module';
import { MySmartLockController } from './controllers/my-smart-lock.controller';
import { SmartLockCredentialController } from './controllers/smart-lock-credential.controller';
import { SmartLockDeviceController } from './controllers/smart-lock-device.controller';
import { SmartLockLogAlertController } from './controllers/smart-lock-log-alert.controller';
import { SmartLockRestrictionController } from './controllers/smart-lock-restriction.controller';
import { TuyaSmartLockGateway } from './gateways/tuya-smart-lock.gateway';
import { SmartLockRateLimitHelper } from './helpers/smart-lock-rate-limit.helper';
import { SmartLockAccessGrantRepository } from './repositories/smart-lock-access-grant.repository';
import { SmartLockAccessLogRepository } from './repositories/smart-lock-access-log.repository';
import { SmartLockAlertRepository } from './repositories/smart-lock-alert.repository';
import { SmartLockCredentialRepository } from './repositories/smart-lock-credential.repository';
import { SmartLockDeviceRepository } from './repositories/smart-lock-device.repository';
import { SmartLockRestrictionRepository } from './repositories/smart-lock-restriction.repository';
import { TuyaSmartLockProvider } from './runtime/providers/tuya-smart-lock.provider';
import { SmartLockTuyaConfigService } from './runtime/providers/tuya/smart-lock-tuya-config.service';
import { TuyaHttpClientService } from './runtime/providers/tuya/tuya-http-client.service';
import { SmartLockDeviceGatewayRepository } from './runtime/repositories/smart-lock-device-gateway.repository';
import { SmartLockGatewayCredentialRepository } from './runtime/repositories/smart-lock-gateway-credential.repository';
import { SmartLockGatewayHealthRepository } from './runtime/repositories/smart-lock-gateway-health.repository';
import { SmartLockGatewayRepository } from './runtime/repositories/smart-lock-gateway.repository';
import { SmartLockFailoverService } from './runtime/services/smart-lock-failover.service';
import { SmartLockGatewayHealthService } from './runtime/services/smart-lock-gateway-health.service';
import { SmartLockGatewayRegistryService } from './runtime/services/smart-lock-gateway-registry.service';
import { SmartLockGatewayResolverService } from './runtime/services/smart-lock-gateway-resolver.service';
import { SmartLockProviderRegistryService } from './runtime/services/smart-lock-provider-registry.service';
import { SmartLockRetryPolicyService } from './runtime/services/smart-lock-retry-policy.service';
import { SmartLockRuntimeService } from './runtime/services/smart-lock-runtime.service';
import { SmartLockSecretResolutionService } from './runtime/services/smart-lock-secret-resolution.service';
import { SmartLockTokenCacheService } from './runtime/services/smart-lock-token-cache.service';
import { SmartLockAccessGrantService } from './services/smart-lock-access-grant.service';
import { SmartLockAlertService } from './services/smart-lock-alert.service';
import { SmartLockAuditService } from './services/smart-lock-audit.service';
import { SmartLockCredentialService } from './services/smart-lock-credential.service';
import { SmartLockDeviceService } from './services/smart-lock-device.service';
import { SmartLockRestrictionService } from './services/smart-lock-restriction.service';

const repositories = [
  SmartLockDeviceRepository,
  SmartLockAccessGrantRepository,
  SmartLockCredentialRepository,
  SmartLockAccessLogRepository,
  SmartLockRestrictionRepository,
  SmartLockAlertRepository,
  SmartLockGatewayRepository,
  SmartLockGatewayCredentialRepository,
  SmartLockDeviceGatewayRepository,
  SmartLockGatewayHealthRepository,
];

const services = [
  SmartLockDeviceService,
  SmartLockAccessGrantService,
  SmartLockCredentialService,
  SmartLockRestrictionService,
  SmartLockAlertService,
  SmartLockAuditService,
  SmartLockGatewayRegistryService,
  SmartLockGatewayResolverService,
  SmartLockProviderRegistryService,
  SmartLockTuyaConfigService,
  TuyaHttpClientService,
  SmartLockSecretResolutionService,
  SmartLockTokenCacheService,
  SmartLockRetryPolicyService,
  SmartLockFailoverService,
  SmartLockGatewayHealthService,
  SmartLockRuntimeService,
];

@Module({
  imports: [AuditModule, RedisModule, PropertyModule, RbacModule, ResidentModule, RoomModule],
  controllers: [
    SmartLockDeviceController,
    SmartLockCredentialController,
    SmartLockRestrictionController,
    SmartLockLogAlertController,
    MySmartLockController,
  ],
  providers: [...repositories, ...services, SmartLockRateLimitHelper, TuyaSmartLockGateway, TuyaSmartLockProvider],
  exports: [...repositories, ...services, SmartLockRateLimitHelper, TuyaSmartLockGateway, TuyaSmartLockProvider],
})
export class SmartLockModule {}
