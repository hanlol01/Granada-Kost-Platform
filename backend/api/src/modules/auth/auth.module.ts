import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IamModule } from '../iam/iam.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthController } from './auth.controller';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthService } from './auth.service';

@Module({
  imports: [IamModule, RbacModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimiterService],
})
export class AuthModule {}
