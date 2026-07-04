import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import configuration from './infrastructure/config/configuration';
import { environmentValidationSchema } from './infrastructure/config/environment.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuditModule } from './infrastructure/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { CorrelationIdMiddleware } from './app/middleware/correlation-id.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { IamModule } from './modules/iam/iam.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { PropertyModule } from './modules/property/property.module';
import { RoomModule } from './modules/room/room.module';
import { ResidentModule } from './modules/resident/resident.module';
import { OccupancyModule } from './modules/occupancy/occupancy.module';
import { BillingModule } from './modules/billing/billing.module';
import { ComplaintModule } from './modules/complaint/complaint.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { VehicleModule } from './modules/vehicle/vehicle.module';
import { ParkingModule } from './modules/parking/parking.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SmartLockModule } from './modules/smart-lock/smart-lock.module';
import { FileModule } from './modules/file/file.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (request) => request.headers['x-correlation-id']?.toString() ?? randomUUID(),
        customProps: (request) => ({
          correlation_id: request.headers['x-correlation-id'],
        }),
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.token',
          'req.body.refresh_token',
        ],
      },
    }),
    DatabaseModule,
    RedisModule,
    AuditModule,
    IamModule,
    RbacModule,
    AuthModule,
    PropertyModule,
    RoomModule,
    ResidentModule,
    OccupancyModule,
    BillingModule,
    ComplaintModule,
    MaintenanceModule,
    VehicleModule,
    ParkingModule,
    NotificationModule,
    SmartLockModule,
    FileModule,
    PaymentGatewayModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
