import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [JwtAuthGuard, RbacGuard],
  exports: [JwtAuthGuard, RbacGuard],
})
export class RbacModule {}
