import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { JwtAuthGuard } from '../rbac/guards/jwt-auth.guard';
import { UserAccessContext } from '../iam/types/iam.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const REFRESH_COOKIE_NAME = 'granada_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authResponse = await this.auth.login(dto, this.contextFromRequest(request));
    this.setRefreshCookie(response, authResponse.refresh_token);
    return authResponse;
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto | undefined,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authResponse = await this.auth.refresh(
      {
        refresh_token: dto?.refresh_token ?? this.readRefreshCookie(request),
      },
      this.contextFromRequest(request),
    );
    this.setRefreshCookie(response, authResponse.refresh_token);
    return authResponse;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: UserAccessContext,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(user, this.contextFromRequest(request));
    this.clearRefreshCookie(response);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: UserAccessContext,
    @Req() request: RequestWithCorrelationId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logoutAll(user, this.contextFromRequest(request));
    this.clearRefreshCookie(response);
    return result;
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

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.refreshCookieOptions(),
      maxAge: this.config.getOrThrow<number>('auth.refreshTokenTtlDays') * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions());
  }

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get<string>('app.env') === 'production',
      path: '/',
    };
  }

  private readRefreshCookie(request: RequestWithCorrelationId): string | undefined {
    const header = request.headers.cookie;
    if (!header) return undefined;

    for (const cookie of header.split(';')) {
      const [rawName, ...rawValue] = cookie.trim().split('=');
      if (rawName === REFRESH_COOKIE_NAME) {
        const value = rawValue.join('=');
        return value ? decodeURIComponent(value) : undefined;
      }
    }

    return undefined;
  }
}
