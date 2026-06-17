import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IamRepository } from '../../iam/repositories/iam.repository';
import { AuthenticatedRequest } from '../types/authenticated-request';

type AccessTokenPayload = {
  sub: string;
  session_id: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly iam: IamRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is required',
      });
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('auth.jwtAccessSecret'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired authentication token',
      });
    }

    const session = await this.iam.findSessionById(payload.session_id);
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session is no longer active',
      });
    }

    const accessContext = await this.iam.getAccessContext(payload.sub, payload.session_id);
    if (!accessContext) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authenticated user was not found',
      });
    }

    request.user = accessContext;
    await this.iam.touchSession(payload.session_id);

    return true;
  }

  private extractBearerToken(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) {
      return null;
    }

    return value.slice('Bearer '.length).trim();
  }
}
