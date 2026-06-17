import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: RequestWithCorrelationId) {
    return this.auth.login(dto, this.contextFromRequest(request));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: RequestWithCorrelationId) {
    return this.auth.refresh(dto, this.contextFromRequest(request));
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: UserAccessContext, @Req() request: RequestWithCorrelationId) {
    return this.auth.logout(user, this.contextFromRequest(request));
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: UserAccessContext, @Req() request: RequestWithCorrelationId) {
    return this.auth.logoutAll(user, this.contextFromRequest(request));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: UserAccessContext) {
    return this.auth.me(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@CurrentUser() user: UserAccessContext) {
    return this.auth.listSessions(user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: UserAccessContext,
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.auth.revokeSession(user, sessionId, this.contextFromRequest(request));
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(
    @CurrentUser() user: UserAccessContext,
    @Body() dto: ChangePasswordDto,
    @Req() request: RequestWithCorrelationId,
  ) {
    return this.auth.changePassword(user, dto, this.contextFromRequest(request));
  }

  private contextFromRequest(request: RequestWithCorrelationId) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }
}
