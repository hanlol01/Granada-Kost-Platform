import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IamModule } from '../iam/iam.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';

@Module({
  imports: [IamModule, JwtModule.register({})],
  providers: [JwtAuthGuard, RbacGuard],
  exports: [IamModule, JwtModule, JwtAuthGuard, RbacGuard],
})
export class RbacModule {}
