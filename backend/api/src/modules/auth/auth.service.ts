import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuthAuditRepository } from '../iam/audit/auth-audit.repository';
import { IamRepository } from '../iam/repositories/iam.repository';
import { UserAccessContext } from '../iam/types/iam.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthTokenResponse, AuthUserResponse, SessionResponse } from './types/auth-response.types';

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

type RefreshTokenParts = {
  sessionId: string;
  secret: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly iam: IamRepository,
    private readonly audit: AuthAuditRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimiter: AuthRateLimiterService,
  ) {}

  async login(dto: LoginDto, context: RequestContext): Promise<AuthTokenResponse> {
    await this.rateLimiter.assertLoginAllowed(dto.identifier, context.ipAddress);
    const user = await this.iam.findUserByIdentifier(dto.identifier);

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      await this.audit.write({
        action: 'auth.login',
        resultStatus: 'failed',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        metadata: { identifier: this.safeIdentifier(dto.identifier) },
      });

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid identifier or password',
      });
    }

    if (user.userStatus !== 'active') {
      await this.audit.write({
        actorUserId: user.id,
        action: 'auth.login',
        resultStatus: 'denied',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
        metadata: { reason: 'inactive_user' },
      });

      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'User account is not active',
      });
    }

    const authResponse = await this.issueTokens(user.id, dto.device_name, context);
    await this.iam.updateLastLogin(user.id);
    await this.rateLimiter.clearLoginAttempts(dto.identifier, context.ipAddress);
    await this.audit.write({
      actorUserId: user.id,
      action: 'auth.login',
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return authResponse;
  }

  async refresh(dto: RefreshTokenDto, context: RequestContext): Promise<AuthTokenResponse> {
    if (!dto.refresh_token) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    const tokenParts = this.parseRefreshToken(dto.refresh_token);
    const session = await this.iam.findSessionById(tokenParts.sessionId);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.refreshTokenHash, tokenParts.secret))
    ) {
      await this.audit.write({
        actorUserId: session?.userId,
        action: 'auth.refresh',
        resultStatus: 'failed',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      });

      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    const user = await this.iam.findUserById(session.userId);
    if (!user || user.userStatus !== 'active') {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session user is no longer active',
      });
    }

    const accessContext = await this.iam.getAccessContext(user.id, session.id);
    if (!accessContext) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authorization context is unavailable',
      });
    }

    const nextSecret = this.generateRefreshSecret();
    const expiresAt = this.refreshExpiresAt();
    await this.iam.rotateRefreshToken(session.id, await argon2.hash(nextSecret), expiresAt);

    return {
      access_token: await this.signAccessToken(accessContext),
      refresh_token: this.serializeRefreshToken(session.id, nextSecret),
      token_type: 'Bearer',
      expires_in: this.config.getOrThrow<number>('auth.jwtAccessTtlSeconds'),
      user: this.serializeUser(accessContext),
    };
  }

  async logout(user: UserAccessContext, context: RequestContext): Promise<{ success: true }> {
    await this.iam.revokeSession(user.sessionId, user.id);
    await this.audit.write({
      actorUserId: user.id,
      action: 'auth.logout',
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return { success: true };
  }

  async logoutAll(user: UserAccessContext, context: RequestContext): Promise<{ success: true }> {
    await this.iam.revokeAllSessions(user.id);
    await this.audit.write({
      actorUserId: user.id,
      action: 'auth.logout_all',
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return { success: true };
  }

  me(user: UserAccessContext): AuthUserResponse {
    return this.serializeUser(user);
  }

  listSessions(user: UserAccessContext): Promise<SessionResponse[]> {
    return this.iam.listActiveSessions(user.id);
  }

  async revokeSession(
    user: UserAccessContext,
    sessionId: string,
    context: RequestContext,
  ): Promise<{ success: true }> {
    await this.iam.revokeSession(sessionId, user.id);
    await this.audit.write({
      actorUserId: user.id,
      action: 'auth.session_revoke',
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
      metadata: { session_id: sessionId },
    });

    return { success: true };
  }

  async changePassword(
    user: UserAccessContext,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<{ success: true }> {
    const record = await this.iam.findUserById(user.id);

    if (!record || !(await argon2.verify(record.passwordHash, dto.current_password))) {
      await this.audit.write({
        actorUserId: user.id,
        action: 'auth.password_change',
        resultStatus: 'failed',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        correlationId: context.correlationId,
      });

      throw new UnprocessableEntityException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Current password is invalid',
      });
    }

    await this.iam.changePassword(user.id, await argon2.hash(dto.new_password));
    await this.iam.revokeAllSessions(user.id);
    await this.audit.write({
      actorUserId: user.id,
      action: 'auth.password_change',
      resultStatus: 'success',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      correlationId: context.correlationId,
    });

    return { success: true };
  }

  private async issueTokens(
    userId: string,
    deviceName: string | undefined,
    context: RequestContext,
  ): Promise<AuthTokenResponse> {
    const refreshSecret = this.generateRefreshSecret();
    const session = await this.iam.createSession({
      userId,
      refreshTokenHash: await argon2.hash(refreshSecret),
      deviceName,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      expiresAt: this.refreshExpiresAt(),
    });
    const accessContext = await this.iam.getAccessContext(userId, session.id);

    if (!accessContext) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authorization context is unavailable',
      });
    }

    return {
      access_token: await this.signAccessToken(accessContext),
      refresh_token: this.serializeRefreshToken(session.id, refreshSecret),
      token_type: 'Bearer',
      expires_in: this.config.getOrThrow<number>('auth.jwtAccessTtlSeconds'),
      user: this.serializeUser(accessContext),
    };
  }

  private signAccessToken(user: UserAccessContext): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id,
        session_id: user.sessionId,
        roles: user.roles,
        property_ids: user.propertyIds,
      },
      {
        secret: this.config.getOrThrow<string>('auth.jwtAccessSecret'),
        expiresIn: this.config.getOrThrow<number>('auth.jwtAccessTtlSeconds'),
      },
    );
  }

  private generateRefreshSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  private serializeRefreshToken(sessionId: string, secret: string): string {
    return `${sessionId}.${secret}`;
  }

  private parseRefreshToken(token: string): RefreshTokenParts {
    const [sessionId, secret] = token.split('.');
    if (!sessionId || !secret) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    return { sessionId, secret };
  }

  private refreshExpiresAt(): Date {
    const days = this.config.getOrThrow<number>('auth.refreshTokenTtlDays');
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private serializeUser(user: UserAccessContext): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      roles: user.roles,
      permissions: user.permissions,
      propertyIds: user.propertyIds,
      property_ids: user.propertyIds,
    };
  }

  private safeIdentifier(identifier: string): string {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes('@')) {
      const [local, domain] = trimmed.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }

    return `${trimmed.slice(0, 3)}***`;
  }
}
