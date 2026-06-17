import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import {
  AuthUserRecord,
  CreateSessionInput,
  UserAccessContext,
  UserSessionRecord,
} from '../types/iam.types';

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  display_name: string;
  user_status: AuthUserRecord['userStatus'];
  last_login_at: Date | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_name: string | null;
  expires_at: Date;
  revoked_at: Date | null;
};

type AccessRow = {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  roles: string[] | null;
  permissions: string[] | null;
  property_ids: string[] | null;
};

@Injectable()
export class IamRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByIdentifier(identifier: string): Promise<AuthUserRecord | null> {
    const result = await this.database.client.query<UserRow>(
      `SELECT id, email, phone, password_hash, display_name, user_status, last_login_at
       FROM users
       WHERE lower(email) = lower($1) OR phone = $1
       LIMIT 1`,
      [identifier],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const result = await this.database.client.query<UserRow>(
      `SELECT id, email, phone, password_hash, display_name, user_status, last_login_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );

    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async createSession(input: CreateSessionInput): Promise<UserSessionRecord> {
    const result = await this.database.client.query<SessionRow>(
      `INSERT INTO user_sessions (
         user_id, refresh_token_hash, device_name, ip_address, user_agent, expires_at
       )
       VALUES ($1, $2, $3, $4::inet, $5, $6)
       RETURNING id, user_id, refresh_token_hash, device_name, expires_at, revoked_at`,
      [
        input.userId,
        input.refreshTokenHash,
        input.deviceName ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.expiresAt,
      ],
    );

    return this.mapSession(result.rows[0]);
  }

  async findSessionById(sessionId: string): Promise<UserSessionRecord | null> {
    const result = await this.database.client.query<SessionRow>(
      `SELECT id, user_id, refresh_token_hash, device_name, expires_at, revoked_at
       FROM user_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId],
    );

    return result.rows[0] ? this.mapSession(result.rows[0]) : null;
  }

  async rotateRefreshToken(sessionId: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.client.query(
      `UPDATE user_sessions
       SET refresh_token_hash = $2,
           expires_at = $3,
           last_activity_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, refreshTokenHash, expiresAt],
    );
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE user_sessions
       SET last_activity_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE user_id = $1`,
      [userId],
    );
  }

  async listActiveSessions(userId: string): Promise<Array<Omit<UserSessionRecord, 'refreshTokenHash'>>> {
    const result = await this.database.client.query<SessionRow>(
      `SELECT id, user_id, refresh_token_hash, device_name, expires_at, revoked_at
       FROM user_sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      deviceName: row.device_name,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    }));
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.database.client.query(
      `UPDATE users
       SET last_login_at = now(), updated_at = now()
       WHERE id = $1`,
      [userId],
    );
  }

  async changePassword(userId: string, passwordHash: string): Promise<void> {
    await this.database.client.query(
      `UPDATE users
       SET password_hash = $2,
           password_changed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [userId, passwordHash],
    );
  }

  async getAccessContext(userId: string, sessionId: string): Promise<UserAccessContext | null> {
    const result = await this.database.client.query<AccessRow>(
      `SELECT
         users.id,
         users.email,
         users.phone,
         users.display_name,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT roles.code), NULL) AS roles,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT permissions.code), NULL) AS permissions,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT user_property_roles.property_id::text), NULL) AS property_ids
       FROM users
       LEFT JOIN user_property_roles
         ON user_property_roles.user_id = users.id
        AND user_property_roles.revoked_at IS NULL
       LEFT JOIN roles ON roles.id = user_property_roles.role_id
       LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
       LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
       WHERE users.id = $1
       GROUP BY users.id
       LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      phone: row.phone,
      displayName: row.display_name,
      roles: row.roles ?? [],
      permissions: row.permissions ?? [],
      propertyIds: row.property_ids ?? [],
      sessionId,
    };
  }

  private mapUser(row: UserRow): AuthUserRecord {
    return {
      id: row.id,
      email: row.email,
      phone: row.phone,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      userStatus: row.user_status,
      lastLoginAt: row.last_login_at,
    };
  }

  private mapSession(row: SessionRow): UserSessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      deviceName: row.device_name,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }
}
