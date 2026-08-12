import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { UserAccessContext } from '../iam/types/iam.types';
import { RequestAuditContext } from '../property/types/property.types';
import {
  AssignOwnerBuildingDto,
  AssignOwnerRoomsDto,
  CreatePropertyOwnerDto,
  ListPropertyOwnersQueryDto,
  ReleaseOwnerAssignmentDto,
  ResetPropertyOwnerPasswordDto,
  UpdatePropertyOwnerDto,
} from './dto/property-owner-management.dto';

type OwnerProfileRow = {
  id: string;
  property_id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  profile_status: 'active' | 'archived';
  user_status: 'active' | 'inactive' | 'suspended';
  created_at: Date;
  building_count?: string;
  room_count?: string;
  scheduled_count?: string;
  total_count?: string;
};

type IdempotencyRow = {
  request_fingerprint: string;
  command_status: 'pending' | 'succeeded' | 'failed';
  response_body: unknown;
};

type PropertyOwnerView = {
  id: string;
  property_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  profile_status: 'active' | 'archived';
  account_status: 'active' | 'inactive' | 'suspended';
  active_rumah_kost_buildings: number;
  active_apart_kost_rooms: number;
  scheduled_assignments: number;
  created_at: Date;
};

type OwnerCreateResponse = {
  status: 'created' | 'already_created';
  owner: PropertyOwnerView;
  temporary_password: string | null;
};

@Injectable()
export class PropertyOwnerManagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditRepository,
  ) {}

  async list(actor: UserAccessContext, query: ListPropertyOwnersQueryDto) {
    this.assertPropertyScope(actor, query.property_id);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const search = query.q?.trim() ? `%${query.q.trim()}%` : null;
    const result = await this.database.client.query<OwnerProfileRow>(
      `SELECT profiles.*,
              users.user_status,
              COUNT(*) OVER()::text AS total_count,
              COUNT(DISTINCT building_assignments.id) FILTER (
                WHERE (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date >= building_assignments.effective_from
                  AND (building_assignments.effective_until IS NULL
                    OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < building_assignments.effective_until)
              )::text AS building_count,
              COUNT(DISTINCT room_assignments.id) FILTER (
                WHERE (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date >= room_assignments.effective_from
                  AND (room_assignments.effective_until IS NULL
                    OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < room_assignments.effective_until)
              )::text AS room_count,
              (
                COUNT(DISTINCT building_assignments.id) FILTER (
                  WHERE building_assignments.effective_from > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                    AND (building_assignments.effective_until IS NULL
                      OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < building_assignments.effective_until)
                )
                + COUNT(DISTINCT room_assignments.id) FILTER (
                  WHERE room_assignments.effective_from > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                    AND (room_assignments.effective_until IS NULL
                      OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < room_assignments.effective_until)
                )
              )::text AS scheduled_count
       FROM property_owner_profiles profiles
       JOIN users ON users.id = profiles.user_id
       LEFT JOIN building_owner_assignments building_assignments
         ON building_assignments.owner_profile_id = profiles.id
       LEFT JOIN room_owner_assignments room_assignments
         ON room_assignments.owner_profile_id = profiles.id
       WHERE profiles.property_id = $1
         AND ($2::text IS NULL OR profiles.profile_status = $2)
         AND ($3::text IS NULL OR profiles.full_name ILIKE $3 OR profiles.phone ILIKE $3 OR profiles.email ILIKE $3)
       GROUP BY profiles.id, users.user_status
       ORDER BY profiles.created_at DESC, profiles.id DESC
       OFFSET $4 LIMIT $5`,
      [query.property_id, query.status ?? null, search, offset, limit],
    );
    return {
      data: result.rows.map((row) => this.mapOwner(row)),
      meta: {
        offset,
        limit,
        total: Number(result.rows[0]?.total_count ?? 0),
      },
    };
  }

  async get(actor: UserAccessContext, ownerId: string, propertyId: string) {
    this.assertPropertyScope(actor, propertyId);
    const owner = await this.findOwner(ownerId, propertyId);
    const [buildings, rooms, history] = await Promise.all([
      this.database.client.query(
        `SELECT assignments.id, assignments.effective_from, assignments.effective_until,
                assignments.assignment_status, assignments.reason,
                buildings.id AS building_id, buildings.building_code, buildings.building_name,
                buildings.gender_policy, COUNT(rooms.id)::int AS covered_room_count
         FROM building_owner_assignments assignments
         JOIN room_buildings buildings ON buildings.id = assignments.building_id
         LEFT JOIN rooms ON rooms.building_id = buildings.id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND (assignments.effective_until IS NULL
             OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         GROUP BY assignments.id, buildings.id
         ORDER BY assignments.effective_from, assignments.id`,
        [ownerId, propertyId],
      ),
      this.database.client.query(
        `SELECT assignments.id, assignments.effective_from, assignments.effective_until,
                assignments.assignment_status, assignments.reason,
                rooms.id AS room_id, rooms.room_code, rooms.gender_policy,
                buildings.building_code, buildings.building_name
         FROM room_owner_assignments assignments
         JOIN rooms ON rooms.id = assignments.room_id
         LEFT JOIN room_buildings buildings ON buildings.id = rooms.building_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND (assignments.effective_until IS NULL
             OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         ORDER BY assignments.effective_from, rooms.room_code, assignments.id`,
        [ownerId, propertyId],
      ),
      this.database.client.query(
        `SELECT 'building' AS ownership_kind, assignments.id, assignments.effective_from,
                assignments.effective_until, assignments.assignment_status, assignments.reason,
                buildings.building_code AS asset_code
         FROM building_owner_assignments assignments
         JOIN room_buildings buildings ON buildings.id = assignments.building_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
         UNION ALL
         SELECT 'room', assignments.id, assignments.effective_from, assignments.effective_until,
                assignments.assignment_status, assignments.reason, rooms.room_code
         FROM room_owner_assignments assignments
         JOIN rooms ON rooms.id = assignments.room_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
         ORDER BY effective_from DESC, id DESC`,
        [ownerId, propertyId],
      ),
    ]);
    return {
      ...this.mapOwner(owner),
      active_and_scheduled_assets: {
        rumah_kost_buildings: buildings.rows,
        apart_kost_rooms: rooms.rows,
      },
      ownership_history: history.rows,
      credentials: {
        login_email: owner.email,
        login_phone: owner.phone,
        password: null,
        reset_available: owner.profile_status === 'active',
      },
    };
  }

  async assetOptions(actor: UserAccessContext, propertyId: string, effectiveDate?: string) {
    this.assertPropertyScope(actor, propertyId);
    const date = effectiveDate ?? (await this.jakartaBusinessDate());
    const [buildings, rooms] = await Promise.all([
      this.database.client.query(
        `SELECT buildings.id, buildings.building_code, buildings.building_name,
                buildings.gender_policy, COUNT(rooms.id)::int AS room_count,
                CASE WHEN assignment.id IS NULL THEN 'available' ELSE 'assigned' END AS availability,
                CASE WHEN assignment.id IS NULL THEN NULL ELSE
                  json_build_object('id', assignment.owner_profile_id, 'full_name', assignment.owner_name)
                END AS current_owner
         FROM room_buildings buildings
         LEFT JOIN rooms
           ON rooms.building_id = buildings.id AND rooms.property_id = buildings.property_id
         LEFT JOIN LATERAL (
           SELECT assignments.id, assignments.owner_profile_id, profiles.full_name AS owner_name
           FROM building_owner_assignments assignments
           JOIN property_owner_profiles profiles ON profiles.id = assignments.owner_profile_id
           WHERE assignments.property_id = buildings.property_id
             AND assignments.building_id = buildings.id
             AND $2::date >= assignments.effective_from
             AND (assignments.effective_until IS NULL OR $2::date < assignments.effective_until)
           ORDER BY assignments.effective_from DESC, assignments.id DESC
           LIMIT 1
         ) assignment ON true
         WHERE buildings.property_id = $1 AND buildings.category = 'rukost'
         GROUP BY buildings.id, assignment.id, assignment.owner_profile_id, assignment.owner_name
         ORDER BY buildings.building_code, buildings.id`,
        [propertyId, date],
      ),
      this.database.client.query(
        `SELECT rooms.id, rooms.room_code, rooms.room_status, rooms.gender_policy,
                buildings.building_code, buildings.building_name,
                CASE WHEN assignment.id IS NULL THEN 'available' ELSE 'assigned' END AS availability,
                CASE WHEN assignment.id IS NULL THEN NULL ELSE
                  json_build_object('id', assignment.owner_profile_id, 'full_name', assignment.owner_name)
                END AS current_owner
         FROM rooms
         LEFT JOIN room_buildings buildings ON buildings.id = rooms.building_id
         LEFT JOIN LATERAL (
           SELECT assignments.id, assignments.owner_profile_id, profiles.full_name AS owner_name
           FROM room_owner_assignments assignments
           JOIN property_owner_profiles profiles ON profiles.id = assignments.owner_profile_id
           WHERE assignments.property_id = rooms.property_id
             AND assignments.room_id = rooms.id
             AND $2::date >= assignments.effective_from
             AND (assignments.effective_until IS NULL OR $2::date < assignments.effective_until)
           ORDER BY assignments.effective_from DESC, assignments.id DESC
           LIMIT 1
         ) assignment ON true
         WHERE rooms.property_id = $1 AND rooms.category = 'apartkost'
         ORDER BY buildings.building_code, rooms.room_code, rooms.id`,
        [propertyId, date],
      ),
    ]);
    return {
      effective_date: date,
      rumah_kost_buildings: buildings.rows,
      apart_kost_rooms: rooms.rows,
    };
  }

  async create(
    actor: UserAccessContext,
    dto: CreatePropertyOwnerDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ): Promise<OwnerCreateResponse> {
    this.assertPropertyScope(actor, dto.property_id);
    this.assertIdentifier(dto.email, dto.phone);
    const route = '/admin/property-owners';
    const key = this.requireIdempotencyKey(idempotencyKey);
    const normalized = {
      property_id: dto.property_id,
      full_name: dto.full_name.trim(),
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
    };
    const fingerprint = this.fingerprint({ ...normalized, initial_password: dto.initial_password });

    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) {
        const response = replay as OwnerCreateResponse;
        return { ...response, status: 'already_created', temporary_password: null };
      }
      await this.lockProperty(client, dto.property_id);
      const duplicate = await client.query(
        `SELECT id FROM users
         WHERE ($1::text IS NOT NULL AND lower(email) = $1)
            OR ($2::text IS NOT NULL AND phone = $2)
         ORDER BY id FOR UPDATE`,
        [normalized.email, normalized.phone],
      );
      if (duplicate.rows.length > 0) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_LOGIN_IDENTIFIER_EXISTS',
          message: 'Email or phone is already linked to another account',
        });
      }
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, phone, password_hash, display_name, user_status, password_changed_at)
         VALUES ($1, $2, $3, $4, 'active', now())
         RETURNING id`,
        [
          normalized.email,
          normalized.phone,
          await argon2.hash(dto.initial_password),
          normalized.full_name,
        ],
      );
      const userId = user.rows[0].id;
      const role = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE code = 'property_owner' FOR SHARE`,
      );
      if (role.rows.length !== 1) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_ROLE_UNAVAILABLE',
          message: 'Property owner role is unavailable',
        });
      }
      await client.query(
        `INSERT INTO user_property_roles (user_id, property_id, role_id, assigned_by_user_id)
         VALUES ($1, $2, $3, $4)`,
        [userId, dto.property_id, role.rows[0].id, actor.id],
      );
      const inserted = await client.query<OwnerProfileRow>(
        `INSERT INTO property_owner_profiles (
           property_id, user_id, full_name, phone, email, address,
           created_by_user_id, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         RETURNING *, 'active'::text AS user_status`,
        [
          dto.property_id,
          userId,
          normalized.full_name,
          normalized.phone,
          normalized.email,
          normalized.address,
          actor.id,
        ],
      );
      const owner = this.mapOwner(inserted.rows[0]);
      const stored: OwnerCreateResponse = {
        status: 'created',
        owner,
        temporary_password: null,
      };
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'property_owner.created',
          resourceType: 'property_owner_profile',
          resourceId: owner.id,
          afterData: { owner_id: owner.id, account_status: 'active' },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.writeEvent(
        client,
        dto.property_id,
        actor.id,
        context,
        'property_owner.created',
        owner.id,
        {
          owner_profile_id: owner.id,
        },
      );
      await this.completeCommand(client, actor.id, route, key, stored, owner.id);
      return { ...stored, temporary_password: dto.initial_password };
    });
  }

  async update(
    actor: UserAccessContext,
    ownerId: string,
    dto: UpdatePropertyOwnerDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    const route = 'PATCH /admin/property-owners/:ownerId';
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({
      owner_id: ownerId,
      property_id: dto.property_id,
      full_name: dto.full_name?.trim(),
      email: dto.email === undefined ? undefined : dto.email.trim().toLowerCase() || null,
      phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
      address: dto.address === undefined ? undefined : dto.address.trim() || null,
    });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      const current = await this.lockOwner(client, ownerId, dto.property_id);
      const fullName = dto.full_name?.trim() ?? current.full_name;
      const phone = dto.phone === undefined ? current.phone : dto.phone.trim() || null;
      const email =
        dto.email === undefined ? current.email : dto.email.trim().toLowerCase() || null;
      this.assertIdentifier(email, phone);
      const duplicate = await client.query(
        `SELECT id FROM users
         WHERE id <> $1 AND (($2::text IS NOT NULL AND lower(email) = $2) OR ($3::text IS NOT NULL AND phone = $3))
         ORDER BY id FOR UPDATE`,
        [current.user_id, email, phone],
      );
      if (duplicate.rows.length > 0) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_LOGIN_IDENTIFIER_EXISTS',
          message: 'Email or phone is already linked to another account',
        });
      }
      await client.query(
        `UPDATE users SET email = $2, phone = $3, display_name = $4, updated_at = now() WHERE id = $1`,
        [current.user_id, email, phone, fullName],
      );
      const updated = await client.query<OwnerProfileRow>(
        `UPDATE property_owner_profiles
         SET full_name = $3, phone = $4, email = $5,
             address = COALESCE($6, address), updated_by_user_id = $7, updated_at = now()
         WHERE id = $1 AND property_id = $2
         RETURNING *, $8::text AS user_status`,
        [
          ownerId,
          dto.property_id,
          fullName,
          phone,
          email,
          dto.address?.trim(),
          actor.id,
          current.user_status,
        ],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'property_owner.updated',
          resourceType: 'property_owner_profile',
          resourceId: ownerId,
          beforeData: { full_name: current.full_name, account_status: current.user_status },
          afterData: { full_name: fullName, account_status: current.user_status },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      const response = this.mapOwner(updated.rows[0]);
      await this.writeEvent(
        client,
        dto.property_id,
        actor.id,
        context,
        'property_owner.updated',
        ownerId,
        { owner_profile_id: ownerId },
      );
      await this.completeCommand(client, actor.id, route, key, response, ownerId);
      return response;
    });
  }

  async resetPassword(
    actor: UserAccessContext,
    ownerId: string,
    dto: ResetPropertyOwnerPasswordDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    const route = 'POST /admin/property-owners/:ownerId/reset-password';
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({
      owner_id: ownerId,
      property_id: dto.property_id,
      new_password: dto.new_password,
    });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) {
        return { ...(replay as { owner_id: string }), temporary_password: null };
      }
      const owner = await this.lockOwner(client, ownerId, dto.property_id);
      if (owner.profile_status !== 'active') {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_ARCHIVED',
          message: 'Archived owner cannot be reset',
        });
      }
      await client.query(
        `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1`,
        [owner.user_id, await argon2.hash(dto.new_password)],
      );
      await client.query(
        `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [owner.user_id],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'property_owner.password_reset',
          resourceType: 'property_owner_profile',
          resourceId: ownerId,
          afterData: { sessions_revoked: true },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      const stored = { owner_id: ownerId, temporary_password: null };
      await this.writeEvent(
        client,
        dto.property_id,
        actor.id,
        context,
        'property_owner.password_reset',
        ownerId,
        { owner_profile_id: ownerId, sessions_revoked: true },
      );
      await this.completeCommand(client, actor.id, route, key, stored, ownerId);
      return { ...stored, temporary_password: dto.new_password };
    });
  }

  async archive(
    actor: UserAccessContext,
    ownerId: string,
    propertyId: string,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, propertyId);
    const route = 'DELETE /admin/property-owners/:ownerId';
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({ owner_id: ownerId, property_id: propertyId });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        propertyId,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      const owner = await this.lockOwner(client, ownerId, propertyId);
      const buildingAssignments = await client.query(
        `SELECT id FROM building_owner_assignments
         WHERE owner_profile_id = $1 AND property_id = $2
           AND (effective_until IS NULL
             OR effective_until > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)
         ORDER BY id
         FOR UPDATE`,
        [ownerId, propertyId],
      );
      const roomAssignments = await client.query(
        `SELECT id FROM room_owner_assignments
         WHERE owner_profile_id = $1 AND property_id = $2
           AND (effective_until IS NULL
             OR effective_until > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)
         ORDER BY id
         FOR UPDATE`,
        [ownerId, propertyId],
      );
      if (buildingAssignments.rows.length > 0 || roomAssignments.rows.length > 0) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_ASSIGNMENTS_STILL_ACTIVE',
          message: 'Release active and scheduled ownership before archiving this owner',
        });
      }
      await client.query(
        `UPDATE property_owner_profiles
         SET profile_status = 'archived', archived_at = now(), archived_by_user_id = $3,
             updated_by_user_id = $3, updated_at = now()
         WHERE id = $1 AND property_id = $2`,
        [ownerId, propertyId, actor.id],
      );
      await client.query(
        `UPDATE users SET user_status = 'inactive', updated_at = now() WHERE id = $1`,
        [owner.user_id],
      );
      await client.query(
        `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [owner.user_id],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId,
          action: 'property_owner.archived',
          resourceType: 'property_owner_profile',
          resourceId: ownerId,
          beforeData: { profile_status: owner.profile_status },
          afterData: { profile_status: 'archived' },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.writeEvent(
        client,
        propertyId,
        actor.id,
        context,
        'property_owner.archived',
        ownerId,
        {
          owner_profile_id: ownerId,
        },
      );
      const response = { owner_id: ownerId, status: 'archived' as const };
      await this.completeCommand(client, actor.id, route, key, response, ownerId);
      return response;
    });
  }

  async assignBuilding(
    actor: UserAccessContext,
    ownerId: string,
    dto: AssignOwnerBuildingDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    this.assertPeriod(dto.effective_from, dto.effective_until);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const route = '/admin/property-owners/:ownerId/building-assignments';
    const fingerprint = this.fingerprint({ ownerId, ...dto });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      await this.lockOwner(client, ownerId, dto.property_id);
      const building = await client.query<{ id: string; building_code: string }>(
        `SELECT buildings.id, buildings.building_code
         FROM room_buildings buildings
         WHERE buildings.id = $1 AND buildings.property_id = $2 AND buildings.category = 'rukost'
         FOR UPDATE`,
        [dto.building_id, dto.property_id],
      );
      if (building.rows.length !== 1) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_RUKOST_BUILDING_REQUIRED',
          message: 'Building ownership requires one Rumah Kost building in this property',
        });
      }
      const roomCount = await client.query<{ room_count: string }>(
        `SELECT COUNT(*)::text AS room_count
         FROM rooms
         WHERE building_id = $1 AND property_id = $2`,
        [dto.building_id, dto.property_id],
      );
      const assignment = await client.query<{ id: string; assignment_status: string }>(
        `INSERT INTO building_owner_assignments (
           property_id, owner_profile_id, building_id, effective_from, effective_until,
           assignment_status, reason, created_by_user_id
         ) VALUES ($1, $2, $3, $4::date, $5::date,
           CASE
             WHEN $4::date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
               THEN 'scheduled'
             ELSE 'active'
           END,
           $6, $7)
         RETURNING id, assignment_status`,
        [
          dto.property_id,
          ownerId,
          dto.building_id,
          dto.effective_from,
          dto.effective_until ?? null,
          dto.reason.trim(),
          actor.id,
        ],
      );
      const response = {
        assignment_id: assignment.rows[0].id,
        ownership_kind: 'building' as const,
        status: assignment.rows[0].assignment_status,
        building_code: building.rows[0].building_code,
        covered_room_count: Number(roomCount.rows[0]?.room_count ?? 0),
      };
      await this.recordAssignmentMutation(
        client,
        actor,
        dto.property_id,
        ownerId,
        response.assignment_id,
        response,
        context,
      );
      await this.completeCommand(client, actor.id, route, key, response, response.assignment_id);
      return response;
    });
  }

  async assignRooms(
    actor: UserAccessContext,
    ownerId: string,
    dto: AssignOwnerRoomsDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    this.assertPeriod(dto.effective_from, dto.effective_until);
    const roomIds = [...new Set(dto.room_ids)].sort();
    if (roomIds.length !== dto.room_ids.length) {
      throw new BadRequestException({
        code: 'PROPERTY_OWNER_ROOM_DUPLICATE',
        message: 'Room list contains duplicates',
      });
    }
    const key = this.requireIdempotencyKey(idempotencyKey);
    const route = '/admin/property-owners/:ownerId/room-assignments';
    const fingerprint = this.fingerprint({ ownerId, ...dto, room_ids: roomIds });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      await this.lockOwner(client, ownerId, dto.property_id);
      const rooms = await client.query<{ id: string; room_code: string }>(
        `SELECT id, room_code FROM rooms
         WHERE property_id = $1 AND category = 'apartkost' AND id = ANY($2::uuid[])
         ORDER BY id FOR UPDATE`,
        [dto.property_id, roomIds],
      );
      if (rooms.rows.length !== roomIds.length) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_APARTKOST_ROOMS_REQUIRED',
          message: 'Every assigned room must be an Apart Kost room in this property',
        });
      }
      const assignments: Array<{ id: string; room_id: string; status: string }> = [];
      for (const room of rooms.rows) {
        const result = await client.query<{ id: string; assignment_status: string }>(
          `INSERT INTO room_owner_assignments (
             property_id, owner_profile_id, room_id, effective_from, effective_until,
             assignment_status, reason, created_by_user_id
           ) VALUES ($1, $2, $3, $4::date, $5::date,
             CASE
               WHEN $4::date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                 THEN 'scheduled'
               ELSE 'active'
             END,
             $6, $7)
           RETURNING id, assignment_status`,
          [
            dto.property_id,
            ownerId,
            room.id,
            dto.effective_from,
            dto.effective_until ?? null,
            dto.reason.trim(),
            actor.id,
          ],
        );
        assignments.push({
          id: result.rows[0].id,
          room_id: room.id,
          status: result.rows[0].assignment_status,
        });
      }
      const response = { ownership_kind: 'room' as const, assignments };
      await this.recordAssignmentMutation(
        client,
        actor,
        dto.property_id,
        ownerId,
        ownerId,
        response,
        context,
      );
      await this.completeCommand(client, actor.id, route, key, response, ownerId);
      return response;
    });
  }

  async releaseAssignment(
    actor: UserAccessContext,
    ownerId: string,
    kind: 'building' | 'room',
    assignmentId: string,
    dto: ReleaseOwnerAssignmentDto,
    idempotencyKey: string | undefined,
    context: RequestAuditContext,
  ) {
    this.assertPropertyScope(actor, dto.property_id);
    const table = kind === 'building' ? 'building_owner_assignments' : 'room_owner_assignments';
    const route = `POST /admin/property-owners/:ownerId/${kind}-assignments/:assignmentId/release`;
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint({
      owner_id: ownerId,
      assignment_id: assignmentId,
      ownership_kind: kind,
      property_id: dto.property_id,
      effective_until: dto.effective_until,
      reason: dto.reason.trim(),
    });
    return this.database.transaction(async (client) => {
      const replay = await this.claimCommand(
        client,
        actor,
        dto.property_id,
        route,
        key,
        fingerprint,
        context,
      );
      if (replay) return replay;
      await this.lockOwner(client, ownerId, dto.property_id);
      const current = await client.query<{
        id: string;
        effective_from: string;
        effective_until: string | null;
        assignment_status: string;
      }>(
        `SELECT id, effective_from, effective_until, assignment_status FROM ${table}
         WHERE id = $1 AND owner_profile_id = $2 AND property_id = $3
         FOR UPDATE`,
        [assignmentId, ownerId, dto.property_id],
      );
      if (current.rows.length !== 1 || current.rows[0].assignment_status === 'released') {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_ASSIGNMENT_UNAVAILABLE',
          message: 'Ownership assignment is unavailable or already released',
        });
      }
      this.assertPeriod(current.rows[0].effective_from, dto.effective_until);
      if (
        current.rows[0].effective_until !== null &&
        dto.effective_until >= current.rows[0].effective_until
      ) {
        throw new ConflictException({
          code: 'PROPERTY_OWNER_ASSIGNMENT_RELEASE_NOT_SHORTENING',
          message: 'Ownership release must shorten the current effective period',
        });
      }
      await client.query(
        `UPDATE ${table}
         SET effective_until = $4::date,
             assignment_status = 'released',
             reason = $5,
             released_by_user_id = $6, updated_at = now()
         WHERE id = $1 AND owner_profile_id = $2 AND property_id = $3`,
        [assignmentId, ownerId, dto.property_id, dto.effective_until, dto.reason.trim(), actor.id],
      );
      await this.audit.write(
        {
          actorUserId: actor.id,
          propertyId: dto.property_id,
          action: 'property_owner.assignment_released',
          resourceType: `${kind}_owner_assignment`,
          resourceId: assignmentId,
          afterData: { effective_until: dto.effective_until, reason: dto.reason.trim() },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.writeEvent(
        client,
        dto.property_id,
        actor.id,
        context,
        'property_owner.assignment_released',
        assignmentId,
        { owner_profile_id: ownerId, ownership_kind: kind, effective_until: dto.effective_until },
      );
      const response = {
        assignment_id: assignmentId,
        ownership_kind: kind,
        status: 'released' as const,
      };
      await this.completeCommand(client, actor.id, route, key, response, assignmentId);
      return response;
    });
  }

  async myWorkspace(actor: UserAccessContext) {
    const profiles = await this.database.client.query<OwnerProfileRow>(
      `SELECT profiles.*, users.user_status
       FROM property_owner_profiles profiles
       JOIN users ON users.id = profiles.user_id
       WHERE profiles.user_id = $1 AND profiles.profile_status = 'active'
       ORDER BY profiles.id`,
      [actor.id],
    );
    if (profiles.rows.length === 0) {
      return {
        owner: null,
        assets: { rumah_kost_buildings: [], apart_kost_rooms: [] },
        financial_summary: { recognized_owner_amount: 0, pending_settlement_amount: 0 },
      };
    }
    if (profiles.rows.length !== 1) {
      throw new ConflictException({
        code: 'PROPERTY_OWNER_PROFILE_AMBIGUOUS',
        message: 'Authenticated owner profile is ambiguous',
      });
    }
    const owner = profiles.rows[0];
    const [buildings, rooms, finance] = await Promise.all([
      this.database.client.query(
        `SELECT buildings.id, buildings.building_code, buildings.building_name,
                buildings.gender_policy, COUNT(rooms.id)::int AS room_count,
                COUNT(rooms.id) FILTER (WHERE rooms.room_status = 'occupied')::int AS occupied_room_count
         FROM building_owner_assignments assignments
         JOIN room_buildings buildings ON buildings.id = assignments.building_id
         LEFT JOIN rooms ON rooms.building_id = buildings.id AND rooms.property_id = assignments.property_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date >= assignments.effective_from
           AND (assignments.effective_until IS NULL
             OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         GROUP BY buildings.id
         ORDER BY buildings.building_code`,
        [owner.id, owner.property_id],
      ),
      this.database.client.query(
        `SELECT rooms.id, rooms.room_code, rooms.room_status, rooms.gender_policy,
                buildings.building_code, buildings.building_name
         FROM room_owner_assignments assignments
         JOIN rooms ON rooms.id = assignments.room_id
         LEFT JOIN room_buildings buildings ON buildings.id = rooms.building_id
         WHERE assignments.owner_profile_id = $1 AND assignments.property_id = $2
           AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date >= assignments.effective_from
           AND (assignments.effective_until IS NULL
             OR (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date < assignments.effective_until)
         ORDER BY rooms.room_code`,
        [owner.id, owner.property_id],
      ),
      this.database.client.query<{
        recognized_owner_amount: string;
        pending_settlement_amount: string;
      }>(
        `SELECT
           COALESCE(SUM(earnings.owner_earned_amount) FILTER (WHERE earnings.earning_status = 'recognized'), 0)::text
             AS recognized_owner_amount,
           COALESCE(SUM(earnings.owner_earned_amount) FILTER (
             WHERE earnings.earning_status = 'recognized' AND lines.earning_id IS NULL
           ), 0)::text AS pending_settlement_amount
         FROM property_owner_earnings earnings
         LEFT JOIN property_owner_settlement_lines lines ON lines.earning_id = earnings.id
         WHERE earnings.owner_profile_id = $1 AND earnings.property_id = $2`,
        [owner.id, owner.property_id],
      ),
    ]);
    return {
      owner: {
        id: owner.id,
        display_name: owner.full_name,
        property_id: owner.property_id,
      },
      assets: { rumah_kost_buildings: buildings.rows, apart_kost_rooms: rooms.rows },
      financial_summary: {
        recognized_owner_amount: Number(finance.rows[0]?.recognized_owner_amount ?? 0),
        pending_settlement_amount: Number(finance.rows[0]?.pending_settlement_amount ?? 0),
      },
    };
  }

  private assertPropertyScope(actor: UserAccessContext, propertyId: string): void {
    if (!actor.propertyIds.includes(propertyId)) {
      throw new ForbiddenException({
        code: 'PROPERTY_SCOPE_DENIED',
        message: 'Authenticated account is not authorized for this property',
      });
    }
  }

  private assertIdentifier(email?: string | null, phone?: string | null): void {
    if (!email && !phone) {
      throw new BadRequestException({
        code: 'PROPERTY_OWNER_LOGIN_IDENTIFIER_REQUIRED',
        message: 'Email or phone is required for the owner account',
      });
    }
  }

  private assertPeriod(effectiveFrom: string, effectiveUntil?: string | null): void {
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException({
        code: 'PROPERTY_OWNER_PERIOD_INVALID',
        message: 'Ownership end date must be after its start date',
      });
    }
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 16 || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key is required',
      });
    }
    return key;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async lockProperty(client: PoolClient, propertyId: string): Promise<void> {
    const result = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND status = 'active' FOR SHARE`,
      [propertyId],
    );
    if (result.rows.length !== 1) {
      throw new ConflictException({
        code: 'PROPERTY_UNAVAILABLE',
        message: 'Property is unavailable',
      });
    }
  }

  private async findOwner(ownerId: string, propertyId: string): Promise<OwnerProfileRow> {
    const result = await this.database.client.query<OwnerProfileRow>(
      `SELECT profiles.*, users.user_status
       FROM property_owner_profiles profiles JOIN users ON users.id = profiles.user_id
       WHERE profiles.id = $1 AND profiles.property_id = $2`,
      [ownerId, propertyId],
    );
    if (result.rows.length !== 1) {
      throw new NotFoundException({
        code: 'PROPERTY_OWNER_NOT_FOUND',
        message: 'Property owner was not found',
      });
    }
    return result.rows[0];
  }

  private async lockOwner(
    client: PoolClient,
    ownerId: string,
    propertyId: string,
  ): Promise<OwnerProfileRow> {
    const result = await client.query<OwnerProfileRow>(
      `SELECT profiles.*, users.user_status
       FROM property_owner_profiles profiles JOIN users ON users.id = profiles.user_id
       WHERE profiles.id = $1 AND profiles.property_id = $2
       ORDER BY profiles.id FOR UPDATE OF profiles, users`,
      [ownerId, propertyId],
    );
    if (result.rows.length !== 1) {
      throw new NotFoundException({
        code: 'PROPERTY_OWNER_NOT_FOUND',
        message: 'Property owner was not found',
      });
    }
    if (result.rows[0].profile_status !== 'active') {
      throw new ConflictException({
        code: 'PROPERTY_OWNER_ARCHIVED',
        message: 'Property owner is archived',
      });
    }
    return result.rows[0];
  }

  private async claimCommand(
    client: PoolClient,
    actor: UserAccessContext,
    propertyId: string,
    route: string,
    key: string,
    fingerprint: string,
    context: RequestAuditContext,
  ): Promise<unknown> {
    const inserted = await client.query(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint,
         command_status, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING id`,
      [propertyId, actor.id, route, key, fingerprint, context.correlationId ?? null],
    );
    if (inserted.rowCount === 1) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actor.id, route, key],
    );
    if (existing.rows.length !== 1 || existing.rows[0].request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was reused with a different request',
      });
    }
    if (existing.rows[0].command_status !== 'succeeded') {
      throw new ConflictException({
        code: 'COMMAND_IN_PROGRESS',
        message: 'The command is still in progress',
      });
    }
    return existing.rows[0].response_body;
  }

  private async completeCommand(
    client: PoolClient,
    actorId: string,
    route: string,
    key: string,
    response: unknown,
    resourceId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = 'succeeded', response_status = 200, response_body = $4::jsonb,
           resource_type = 'property_owner', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorId, route, key, JSON.stringify(response), resourceId],
    );
  }

  private async recordAssignmentMutation(
    client: PoolClient,
    actor: UserAccessContext,
    propertyId: string,
    ownerId: string,
    resourceId: string,
    afterData: unknown,
    context: RequestAuditContext,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: actor.id,
        propertyId,
        action: 'property_owner.assignment_created',
        resourceType: 'property_owner_assignment',
        resourceId,
        afterData,
        resultStatus: 'success',
        ...context,
      },
      client,
    );
    await this.writeEvent(
      client,
      propertyId,
      actor.id,
      context,
      'property_owner.assignment_created',
      resourceId,
      {
        owner_profile_id: ownerId,
        assignment: afterData,
      },
    );
  }

  private async writeEvent(
    client: PoolClient,
    propertyId: string,
    actorId: string,
    context: RequestAuditContext,
    eventType: string,
    aggregateId: string,
    payload: unknown,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_events (
         property_id, event_key, event_type, aggregate_type, aggregate_id,
         payload, correlation_id, actor_user_id
       ) VALUES ($1, $2, $3, 'property_owner', $4, $5::jsonb, $6, $7)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        propertyId,
        `${eventType}:${aggregateId}:${context.correlationId ?? randomUUID()}`,
        eventType,
        aggregateId,
        JSON.stringify(payload),
        context.correlationId ?? null,
        actorId,
      ],
    );
  }

  private async jakartaBusinessDate(): Promise<string> {
    const result = await this.database.client.query<{ business_date: string }>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date::text AS business_date`,
    );
    const businessDate = String(result.rows[0]?.business_date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new Error('Jakarta business date is unavailable');
    }
    return businessDate;
  }

  private mapOwner(row: OwnerProfileRow): PropertyOwnerView {
    return {
      id: row.id,
      property_id: row.property_id,
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      profile_status: row.profile_status,
      account_status: row.user_status,
      active_rumah_kost_buildings: Number(row.building_count ?? 0),
      active_apart_kost_rooms: Number(row.room_count ?? 0),
      scheduled_assignments: Number(row.scheduled_count ?? 0),
      created_at: row.created_at,
    };
  }
}
