import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { ChangeOwnerEmailDto } from './dto/change-owner-email.dto';

@Injectable()
export class OwnerAccountService {
  constructor(private readonly database: DatabaseService) {}

  async changeEmail(
    actor: UserAccessContext,
    dto: ChangeOwnerEmailDto,
    context: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ) {
    if (!actor.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'OWNER_ACCOUNT_ACCESS_DENIED',
        message: 'Pengaturan ini hanya tersedia untuk akun Owner.',
      });
    }
    const email = dto.email.trim().toLowerCase();
    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<{
          id: string;
          profile_id: string;
          email: string | null;
          password_hash: string;
        }>(
          `SELECT account.id, profile.id AS profile_id, account.email, account.password_hash
           FROM users account
           JOIN property_owner_profiles profile ON profile.user_id = account.id
           WHERE account.id = $1 AND account.user_status = 'active'
           FOR UPDATE OF account, profile`,
          [actor.id],
        );
        if (result.rows.length !== 1) {
          throw new ForbiddenException({
            code: 'OWNER_ACCOUNT_CONTEXT_INVALID',
            message: 'Profil akun Owner tidak tersedia. Hubungi Pengelola.',
          });
        }
        const account = result.rows[0];
        if (!(await argon2.verify(account.password_hash, dto.current_password))) {
          throw new UnprocessableEntityException({
            code: 'CURRENT_PASSWORD_INVALID',
            message: 'Password saat ini tidak sesuai.',
          });
        }
        if (account.email?.trim().toLowerCase() === email) {
          return { success: true, changed: false };
        }
        const duplicate = await client.query(
          'SELECT id FROM users WHERE id <> $1 AND lower(email) = $2 LIMIT 1',
          [actor.id, email],
        );
        if (duplicate.rows.length) throw this.emailConflict();
        await client.query('UPDATE users SET email = $2, updated_at = now() WHERE id = $1', [
          actor.id,
          email,
        ]);
        await client.query(
          `UPDATE property_owner_profiles
           SET email = $2, updated_by_user_id = $3, updated_at = now() WHERE id = $1`,
          [account.profile_id, email, actor.id],
        );
        await client.query(
          `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`,
          [actor.id],
        );
        await client.query(
          `INSERT INTO auth_audit_logs
           (actor_user_id, action, result_status, ip_address, user_agent, correlation_id, metadata)
           VALUES ($1, 'auth.owner_email_change', 'success', $2::inet, $3, $4, $5::jsonb)`,
          [
            actor.id,
            context.ipAddress ?? null,
            context.userAgent ?? null,
            context.correlationId ?? null,
            JSON.stringify({ old_email: account.email, new_email: email }),
          ],
        );
        return { success: true, changed: true };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw this.emailConflict();
      }
      throw error;
    }
  }

  private emailConflict() {
    return new ConflictException({
      code: 'OWNER_EMAIL_ALREADY_USED',
      message: 'Email sudah digunakan akun lain. Gunakan alamat email berbeda.',
    });
  }
}
