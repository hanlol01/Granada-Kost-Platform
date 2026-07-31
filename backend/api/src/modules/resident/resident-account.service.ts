import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { RequestAuditContext } from '../property/types/property.types';
import { ResidentRepository } from './repositories/resident.repository';

export type ResidentAccountProvisionResult = {
  status: 'provisioned' | 'already_linked' | 'already_issued';
  temporaryPassword: string | null;
};

type CommandRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
};

type LockedResidentRow = {
  id: string;
  property_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type UserMatchRow = {
  id: string;
  email: string | null;
  phone: string | null;
};

@Injectable()
export class ResidentAccountService {
  private readonly route = '/residents/:residentId/account';

  constructor(
    private readonly database: DatabaseService,
    private readonly residents: ResidentRepository,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async provision(
    actor: UserAccessContext,
    residentId: string,
    propertyId: string,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ): Promise<ResidentAccountProvisionResult> {
    const key = idempotencyKey?.trim();
    if (!key || key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    }

    await this.properties.assertCanReadProperty(actor, propertyId);
    const resident = await this.residents.findByIdInProperty(residentId, propertyId);
    if (!resident) {
      throw new ConflictException({
        code: 'RESIDENT_NOT_FOUND',
        message: 'Resident is unavailable for account provisioning',
      });
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ propertyId: resident.propertyId, residentId }))
      .digest('hex');

    return this.database.transaction(async (client) => {
      const claimed = await client.query(
        `INSERT INTO idempotency_commands (
           property_id, actor_user_id, route, idempotency_key, request_fingerprint,
           command_status, correlation_id
         )
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
         RETURNING id`,
        [
          resident.propertyId,
          actor.id,
          this.route,
          key,
          fingerprint,
          context.correlationId ?? null,
        ],
      );

      if (claimed.rowCount === 0) {
        return this.replay(client, actor.id, key, fingerprint);
      }

      const locked = await this.lockResident(client, residentId, resident.propertyId);
      const identity = this.canonicalIdentity(locked);
      const result = await this.linkAccount(client, locked, identity, actor.id);

      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: locked.property_id,
          action: 'resident.account_provision',
          resourceType: 'resident',
          resourceId: locked.id,
          afterData: { account_status: result.status },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await client.query(
        `UPDATE idempotency_commands
         SET command_status = 'succeeded', response_status = 200,
             response_body = $4::jsonb, resource_type = 'resident', resource_id = $5,
             completed_at = now()
         WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
        [
          actor.id,
          this.route,
          key,
          JSON.stringify({ data: { status: result.status, temporary_password: null } }),
          locked.id,
        ],
      );
      return result;
    });
  }

  private async replay(
    client: PoolClient,
    actorId: string,
    key: string,
    fingerprint: string,
  ): Promise<ResidentAccountProvisionResult> {
    const result = await client.query<CommandRow>(
      `SELECT request_fingerprint, command_status
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorId, this.route, key],
    );
    const command = result.rows[0];
    if (!command || command.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency-Key was already used for another command',
      });
    }
    if (command.command_status !== 'succeeded') {
      throw new ServiceUnavailableException({
        code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
        message: 'Account provisioning is still in progress',
      });
    }
    return { status: 'already_issued', temporaryPassword: null };
  }

  private async lockResident(
    client: PoolClient,
    residentId: string,
    propertyId: string,
  ): Promise<LockedResidentRow> {
    const result = await client.query<LockedResidentRow>(
      `SELECT id, property_id, user_id, full_name, email, phone
       FROM residents
       WHERE id = $1 AND property_id = $2
       FOR UPDATE`,
      [residentId, propertyId],
    );
    const resident = result.rows[0];
    if (!resident) {
      throw new ConflictException({
        code: 'RESIDENT_SCOPE_STALE',
        message: 'Resident property scope changed before account provisioning',
      });
    }
    return resident;
  }

  private canonicalIdentity(resident: LockedResidentRow): {
    email: string | null;
    phone: string | null;
  } {
    const email = resident.email?.trim().toLowerCase() || null;
    const phone = resident.phone ? this.normalizeIndonesianPhone(resident.phone) : null;
    if (!email && !phone) {
      throw new BadRequestException({
        code: 'RESIDENT_LOGIN_IDENTIFIER_REQUIRED',
        message: 'Resident email or phone is required before provisioning an account',
      });
    }
    return { email, phone };
  }

  private async linkAccount(
    client: PoolClient,
    resident: LockedResidentRow,
    identity: { email: string | null; phone: string | null },
    actorId: string,
  ): Promise<ResidentAccountProvisionResult> {
    const matches = await client.query<UserMatchRow>(
      `SELECT id, email, phone
       FROM users
       WHERE ($1::text IS NOT NULL AND lower(email) = $1)
          OR (
            $2::text IS NOT NULL
            AND CASE
              WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '0%'
                THEN '62' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 2)
              ELSE regexp_replace(phone, '[^0-9]', '', 'g')
            END = $2
          )
       ORDER BY id ASC
       FOR UPDATE`,
      [identity.email, identity.phone],
    );
    const distinctUsers = new Map(matches.rows.map((row) => [row.id, row]));
    if (distinctUsers.size > 1) {
      throw new ConflictException({
        code: 'RESIDENT_IDENTITY_CONFLICT',
        message: 'Resident email and phone resolve to different accounts',
      });
    }

    let userId = resident.user_id;
    let temporaryPassword: string | null = null;
    const matchedUser = [...distinctUsers.values()][0] ?? null;
    if (userId && !matchedUser) {
      throw new ConflictException({
        code: 'RESIDENT_IDENTITY_CONFLICT',
        message: 'Linked account does not match the resident login identity',
      });
    }
    if (userId && matchedUser && matchedUser.id !== userId) {
      throw new ConflictException({
        code: 'RESIDENT_IDENTITY_CONFLICT',
        message: 'Resident is already linked to another account',
      });
    }

    if (!userId && matchedUser) userId = matchedUser.id;
    if (!userId) {
      temporaryPassword = randomBytes(24).toString('base64url');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (
           email, phone, password_hash, display_name, user_status, password_changed_at
         )
         VALUES ($1, $2, $3, $4, 'active', NULL)
         RETURNING id`,
        [identity.email, identity.phone, await argon2.hash(temporaryPassword), resident.full_name],
      );
      userId = inserted.rows[0].id;
    }

    await client.query(
      `INSERT INTO user_property_roles (user_id, property_id, role_id, assigned_by_user_id)
       SELECT $1, $2, roles.id, $3
       FROM roles
       WHERE roles.code = 'resident'
         AND NOT EXISTS (
           SELECT 1
           FROM user_property_roles AS active_membership
           WHERE active_membership.user_id = $1
             AND active_membership.property_id = $2
             AND active_membership.role_id = roles.id
             AND active_membership.revoked_at IS NULL
         )`,
      [userId, resident.property_id, actorId],
    );
    const membership = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM user_property_roles
       JOIN roles ON roles.id = user_property_roles.role_id
       WHERE user_property_roles.user_id = $1
         AND user_property_roles.property_id = $2
         AND user_property_roles.revoked_at IS NULL
         AND roles.code = 'resident'`,
      [userId, resident.property_id],
    );
    if (membership.rows[0]?.total !== '1') {
      throw new ConflictException({
        code: 'RESIDENT_ROLE_AUTHORITY_INVALID',
        message: 'Resident role authority is unavailable or ambiguous',
      });
    }
    const linked = await client.query(
      `UPDATE residents
       SET user_id = $2, updated_by_user_id = $3, updated_at = now()
       WHERE id = $1 AND property_id = $4 AND (user_id IS NULL OR user_id = $2)`,
      [resident.id, userId, actorId, resident.property_id],
    );
    if (linked.rowCount !== 1) {
      throw new ConflictException({
        code: 'RESIDENT_IDENTITY_CONFLICT',
        message: 'Resident identity linkage changed before provisioning completed',
      });
    }

    return {
      status: temporaryPassword ? 'provisioned' : 'already_linked',
      temporaryPassword,
    };
  }

  private normalizeIndonesianPhone(rawPhone: string): string {
    const compact = rawPhone.trim().replace(/[\s().-]/g, '');
    if (!/^\+?\d+$/.test(compact)) {
      throw new BadRequestException({
        code: 'RESIDENT_PHONE_INVALID',
        message: 'Resident phone must be a valid Indonesian number',
      });
    }
    const normalized = compact.startsWith('+62')
      ? compact.slice(1)
      : compact.startsWith('0')
        ? `62${compact.slice(1)}`
        : compact;
    if (!normalized.startsWith('62') || normalized.length < 10 || normalized.length > 15) {
      throw new BadRequestException({
        code: 'RESIDENT_PHONE_INVALID',
        message: 'Resident phone must be a valid Indonesian number',
      });
    }
    return normalized;
  }
}
