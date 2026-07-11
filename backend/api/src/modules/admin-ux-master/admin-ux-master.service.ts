import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { v2Data, v2List, normalizePagination } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  CreateFacilityCategoryDto,
  CreateKostTypeDto,
  CreateKostTypeRuleDto,
  CreateRoomFacilityV2Dto,
  ListFacilityCategoriesQueryDto,
  ListKostTypeRulesQueryDto,
  ListKostTypesQueryDto,
  ListRoomFacilitiesQueryDto,
  ReorderFacilityCategoriesDto,
  ReorderKostTypeRulesDto,
  ReorderRoomFacilitiesDto,
  ReplaceKostTypeFacilitiesDto,
  UpdateFacilityCategoryDto,
  UpdateKostTypeDto,
  UpdateKostTypeRuleDto,
  UpdateRoomFacilityV2Dto,
} from './admin-ux-master.dto';

type DbRow = Record<string, unknown>;

const LEGACY_ROOM_PRICE_MAX = 2_147_483_647;

@Injectable()
export class AdminUxMasterService {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async listKostTypes(user: UserAccessContext, query: ListKostTypesQueryDto) {
    const scope = await this.readScope(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<DbRow>(
      `SELECT
         kost_type.id, kost_type.property_id, kost_type.category, kost_type.name, kost_type.slug,
         kost_type.description_short, kost_type.description_long, kost_type.room_size_label,
         kost_type.room_size_m2, kost_type.monthly_price, kost_type.yearly_price,
         kost_type.deposit_amount, kost_type.max_occupants, kost_type.public_visible,
         kost_type.notes, kost_type.status, kost_type.deleted_at, kost_type.created_at,
         kost_type.updated_at,
         COUNT(DISTINCT room.id)::int AS room_count,
         COUNT(DISTINCT assignment.facility_id)::int AS facility_count,
         COUNT(*) OVER()::int AS total
       FROM kost_types kost_type
       LEFT JOIN rooms room ON room.kost_type_id = kost_type.id
       LEFT JOIN kost_type_facility_assignments assignment ON assignment.kost_type_id = kost_type.id
       WHERE ($1::uuid[] IS NULL OR kost_type.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR kost_type.property_id = $2)
         AND ($3::text IS NULL OR kost_type.category = $3)
         AND ($4::text IS NULL OR kost_type.status = $4)
         AND ($5::boolean = true OR kost_type.deleted_at IS NULL)
         AND ($6::text IS NULL OR kost_type.name ILIKE '%' || $6 || '%' OR kost_type.slug ILIKE '%' || $6 || '%')
       GROUP BY kost_type.id
       ORDER BY kost_type.property_id, kost_type.category, kost_type.created_at
       LIMIT $7 OFFSET $8`,
      [
        scope,
        query.property_id ?? null,
        query.category ?? null,
        query.status ?? null,
        query.include_deleted ?? false,
        query.q ?? null,
        limit,
        offset,
      ],
    );
    const total = Number(result.rows[0]?.total ?? 0);
    return v2List(
      result.rows.map((row) => this.kostTypeSummary(row)),
      limit,
      offset,
      total,
    );
  }

  async getKostType(user: UserAccessContext, id: string) {
    const record = await this.requireKostType(id);
    await this.properties.assertCanReadProperty(user, String(record.property_id));
    return v2Data(await this.kostTypeDetail(record));
  }

  async createKostType(
    user: UserAccessContext,
    dto: CreateKostTypeDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    this.assertLegacySnapshotRange(dto.monthly_price, dto.yearly_price, dto.deposit_amount);
    try {
      const result = await this.database.client.query<DbRow>(
        `INSERT INTO kost_types (
           property_id, category, name, slug, description_short, description_long,
           room_size_label, room_size_m2, monthly_price, yearly_price, deposit_amount,
           public_visible, notes, status, created_by_user_id, updated_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, true), $13,
                 COALESCE($14, 'active'), $15, $15)
         RETURNING *`,
        [
          dto.property_id,
          dto.category,
          dto.name.trim(),
          dto.slug.trim().toLowerCase(),
          dto.description_short ?? null,
          dto.description_long ?? null,
          dto.room_size_label ?? null,
          dto.room_size_m2 ?? null,
          dto.monthly_price,
          dto.yearly_price,
          dto.deposit_amount,
          dto.public_visible ?? null,
          dto.notes ?? null,
          dto.status ?? null,
          user.id,
        ],
      );
      const record = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: dto.property_id,
        action: 'kost_type.create',
        resourceType: 'kost_type',
        resourceId: String(record.id),
        afterData: this.auditKostType(record),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(await this.kostTypeDetail(record));
    } catch (error) {
      this.rethrowKostTypeConflict(error);
    }
  }

  async updateKostType(
    user: UserAccessContext,
    id: string,
    dto: UpdateKostTypeDto,
    context: RequestAuditContext,
  ) {
    if (dto.category !== undefined) {
      throw new BadRequestException({
        code: 'KOST_TYPE_CATEGORY_IMMUTABLE',
        message: 'Kost type category cannot be changed.',
      });
    }
    const before = await this.requireKostType(id);
    await this.assertCanMutate(user, String(before.property_id));
    this.assertLegacySnapshotRange(
      dto.monthly_price ?? Number(before.monthly_price),
      dto.yearly_price ?? Number(before.yearly_price),
      dto.deposit_amount ?? Number(before.deposit_amount),
    );
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<DbRow>(
        `UPDATE kost_types
         SET name = COALESCE($2, name),
             slug = COALESCE($3, slug),
             description_short = COALESCE($4, description_short),
             description_long = COALESCE($5, description_long),
             room_size_label = COALESCE($6, room_size_label),
             room_size_m2 = COALESCE($7, room_size_m2),
             monthly_price = COALESCE($8, monthly_price),
             yearly_price = COALESCE($9, yearly_price),
             deposit_amount = COALESCE($10, deposit_amount),
             public_visible = COALESCE($11, public_visible),
             notes = COALESCE($12, notes),
             status = COALESCE($13, status),
             updated_by_user_id = $14,
             updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [
          id,
          dto.name?.trim() ?? null,
          dto.slug?.trim().toLowerCase() ?? null,
          dto.description_short ?? null,
          dto.description_long ?? null,
          dto.room_size_label ?? null,
          dto.room_size_m2 ?? null,
          dto.monthly_price ?? null,
          dto.yearly_price ?? null,
          dto.deposit_amount ?? null,
          dto.public_visible ?? null,
          dto.notes ?? null,
          dto.status ?? null,
          user.id,
        ],
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new NotFoundException({
          code: 'KOST_TYPE_NOT_FOUND',
          message: 'Kost type not found.',
        });
      }
      await this.syncLegacyRoomSnapshots(client, id, updated);
      await client.query('COMMIT');
      await this.audit.write({
        actorUserId: user.id,
        propertyId: String(updated.property_id),
        action: 'kost_type.update',
        resourceType: 'kost_type',
        resourceId: id,
        beforeData: this.auditKostType(before),
        afterData: this.auditKostType(updated),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(await this.kostTypeDetail(updated));
    } catch (error) {
      await this.rollback(client);
      this.rethrowKostTypeConflict(error);
    } finally {
      client.release();
    }
  }

  async deleteKostType(user: UserAccessContext, id: string, context: RequestAuditContext) {
    const before = await this.requireKostType(id);
    await this.assertCanMutate(user, String(before.property_id));
    const inUse = await this.database.client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM rooms WHERE kost_type_id = $1`,
      [id],
    );
    if (Number(inUse.rows[0]?.total ?? 0) > 0) {
      throw new ConflictException({
        code: 'KOST_TYPE_IN_USE',
        message: 'Kost type is still used by a room.',
      });
    }
    const result = await this.database.client.query<DbRow>(
      `UPDATE kost_types
       SET deleted_at = now(), deleted_by_user_id = $2, updated_by_user_id = $2, updated_at = now(), status = 'inactive'
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, user.id],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({ code: 'KOST_TYPE_NOT_FOUND', message: 'Kost type not found.' });
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'kost_type.delete',
      resourceType: 'kost_type',
      resourceId: id,
      beforeData: this.auditKostType(before),
      afterData: this.auditKostType(result.rows[0]),
      resultStatus: 'success',
      ...context,
    });
    return v2Data({ id, deleted: true });
  }

  async replaceKostTypeFacilities(
    user: UserAccessContext,
    id: string,
    dto: ReplaceKostTypeFacilitiesDto,
    context: RequestAuditContext,
  ) {
    const kostType = await this.requireKostType(id);
    if (String(kostType.property_id) !== dto.property_id) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Kost type and request property do not match.',
      });
    }
    await this.assertCanMutate(user, dto.property_id);
    const uniqueIds = [...new Set(dto.facility_ids)];
    const facilityResult = await this.database.client.query<{ id: string }>(
      `SELECT id FROM room_facilities
       WHERE property_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
      [dto.property_id, uniqueIds],
    );
    if (facilityResult.rows.length !== uniqueIds.length) {
      throw new UnprocessableEntityException({
        code: 'FACILITY_PROPERTY_MISMATCH',
        message: 'Facilities must be active and belong to the kost type property.',
      });
    }
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM kost_type_facility_assignments WHERE kost_type_id = $1', [
        id,
      ]);
      if (uniqueIds.length) {
        await client.query(
          `INSERT INTO kost_type_facility_assignments (kost_type_id, facility_id)
           SELECT $1, facility_id FROM unnest($2::uuid[]) AS facility_id
           ON CONFLICT (kost_type_id, facility_id) DO NOTHING`,
          [id, uniqueIds],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId: dto.property_id,
      action: 'kost_type.facilities_replace',
      resourceType: 'kost_type',
      resourceId: id,
      afterData: { facility_ids: uniqueIds },
      resultStatus: 'success',
      ...context,
    });
    return v2Data(await this.kostTypeDetail(await this.requireKostType(id)));
  }

  async listFacilityCategories(user: UserAccessContext, query: ListFacilityCategoriesQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<DbRow>(
      `SELECT id, property_id, name, icon, sort_order, created_at, updated_at, COUNT(*) OVER()::int AS total
       FROM facility_categories
       WHERE property_id = $1
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
       ORDER BY sort_order, name, id
       LIMIT $3 OFFSET $4`,
      [query.property_id, query.q ?? null, limit, offset],
    );
    return v2List(
      result.rows.map((row) => this.row(row)),
      limit,
      offset,
      Number(result.rows[0]?.total ?? 0),
    );
  }

  async createFacilityCategory(
    user: UserAccessContext,
    dto: CreateFacilityCategoryDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    try {
      const result = await this.database.client.query<DbRow>(
        `INSERT INTO facility_categories (property_id, name, icon, sort_order)
         VALUES ($1, $2, $3, COALESCE($4, 0)) RETURNING *`,
        [dto.property_id, dto.name.trim(), dto.icon ?? null, dto.sort_order ?? null],
      );
      const record = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: dto.property_id,
        action: 'facility_category.create',
        resourceType: 'facility_category',
        resourceId: String(record.id),
        afterData: this.row(record),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.row(record));
    } catch (error) {
      this.rethrowUnique(
        error,
        'FACILITY_CATEGORY_EXISTS',
        'A facility category with this name already exists.',
      );
    }
  }

  async updateFacilityCategory(
    user: UserAccessContext,
    id: string,
    dto: UpdateFacilityCategoryDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireById('facility_categories', id, 'FACILITY_CATEGORY_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    try {
      const result = await this.database.client.query<DbRow>(
        `UPDATE facility_categories
         SET name = COALESCE($2, name), icon = COALESCE($3, icon), sort_order = COALESCE($4, sort_order), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, dto.name?.trim() ?? null, dto.icon ?? null, dto.sort_order ?? null],
      );
      const updated = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: String(updated.property_id),
        action: 'facility_category.update',
        resourceType: 'facility_category',
        resourceId: id,
        beforeData: this.row(before),
        afterData: this.row(updated),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.row(updated));
    } catch (error) {
      this.rethrowUnique(
        error,
        'FACILITY_CATEGORY_EXISTS',
        'A facility category with this name already exists.',
      );
    }
  }

  async deleteFacilityCategory(user: UserAccessContext, id: string, context: RequestAuditContext) {
    const before = await this.requireById('facility_categories', id, 'FACILITY_CATEGORY_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    const used = await this.database.client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM room_facilities WHERE category_id = $1 AND status = 'active'`,
      [id],
    );
    if (Number(used.rows[0]?.total ?? 0) > 0) {
      throw new ConflictException({
        code: 'FACILITY_CATEGORY_IN_USE',
        message: 'Category is used by active facilities.',
      });
    }
    await this.database.client.query('DELETE FROM facility_categories WHERE id = $1', [id]);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'facility_category.delete',
      resourceType: 'facility_category',
      resourceId: id,
      beforeData: this.row(before),
      resultStatus: 'success',
      ...context,
    });
    return v2Data({ id, deleted: true });
  }

  async reorderFacilityCategories(
    user: UserAccessContext,
    dto: ReorderFacilityCategoriesDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    await this.reorder(
      'facility_categories',
      dto.property_id,
      null,
      dto.items,
      'facility_category.reorder',
      user,
      context,
    );
    return this.listFacilityCategories(user, {
      property_id: dto.property_id,
      limit: 100,
      offset: 0,
    });
  }

  async listRoomFacilities(user: UserAccessContext, query: ListRoomFacilitiesQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<DbRow>(
      `SELECT facility.id, facility.property_id, facility.category_id, facility.name, facility.icon,
              facility.description, facility.status, facility.sort_order, facility.created_at, facility.updated_at,
              category.name AS category_name, COUNT(*) OVER()::int AS total
       FROM room_facilities facility
       LEFT JOIN facility_categories category ON category.id = facility.category_id
       WHERE facility.property_id = $1
         AND ($2::uuid IS NULL OR facility.category_id = $2)
         AND ($3::text IS NULL OR facility.status = $3)
         AND ($4::text IS NULL OR facility.name ILIKE '%' || $4 || '%')
       ORDER BY facility.sort_order, facility.name, facility.id
       LIMIT $5 OFFSET $6`,
      [
        query.property_id,
        query.category_id ?? null,
        query.status ?? null,
        query.q ?? null,
        limit,
        offset,
      ],
    );
    return v2List(
      result.rows.map((row) => this.row(row)),
      limit,
      offset,
      Number(result.rows[0]?.total ?? 0),
    );
  }

  async createRoomFacility(
    user: UserAccessContext,
    dto: CreateRoomFacilityV2Dto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    await this.assertFacilityCategoryProperty(dto.category_id, dto.property_id);
    try {
      const result = await this.database.client.query<DbRow>(
        `INSERT INTO room_facilities (
           property_id, category_id, name, icon, description, status, sort_order, created_by_user_id, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'), COALESCE($7, 0), $8, $8)
         RETURNING *`,
        [
          dto.property_id,
          dto.category_id,
          dto.name.trim(),
          dto.icon ?? null,
          dto.description ?? null,
          dto.status ?? null,
          dto.sort_order ?? null,
          user.id,
        ],
      );
      const record = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: dto.property_id,
        action: 'room_facility.create',
        resourceType: 'room_facility',
        resourceId: String(record.id),
        afterData: this.row(record),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.row(record));
    } catch (error) {
      this.rethrowUnique(
        error,
        'ROOM_FACILITY_EXISTS',
        'A facility with this name already exists.',
      );
    }
  }

  async updateRoomFacility(
    user: UserAccessContext,
    id: string,
    dto: UpdateRoomFacilityV2Dto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireById('room_facilities', id, 'ROOM_FACILITY_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    if (dto.category_id)
      await this.assertFacilityCategoryProperty(dto.category_id, String(before.property_id));
    try {
      const result = await this.database.client.query<DbRow>(
        `UPDATE room_facilities
         SET category_id = COALESCE($2, category_id), name = COALESCE($3, name), icon = COALESCE($4, icon),
             description = COALESCE($5, description), status = COALESCE($6, status),
             sort_order = COALESCE($7, sort_order), updated_by_user_id = $8, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [
          id,
          dto.category_id ?? null,
          dto.name?.trim() ?? null,
          dto.icon ?? null,
          dto.description ?? null,
          dto.status ?? null,
          dto.sort_order ?? null,
          user.id,
        ],
      );
      const updated = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: String(updated.property_id),
        action: 'room_facility.update',
        resourceType: 'room_facility',
        resourceId: id,
        beforeData: this.row(before),
        afterData: this.row(updated),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.row(updated));
    } catch (error) {
      this.rethrowUnique(
        error,
        'ROOM_FACILITY_EXISTS',
        'A facility with this name already exists.',
      );
    }
  }

  async deleteRoomFacility(user: UserAccessContext, id: string, context: RequestAuditContext) {
    const before = await this.requireById('room_facilities', id, 'ROOM_FACILITY_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    const used = await this.database.client.query<{ total: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM kost_type_facility_assignments WHERE facility_id = $1) +
         (SELECT COUNT(*) FROM room_facility_assignments WHERE facility_id = $1)
       )::text AS total`,
      [id],
    );
    if (Number(used.rows[0]?.total ?? 0) > 0) {
      throw new ConflictException({
        code: 'ROOM_FACILITY_IN_USE',
        message: 'Facility is assigned and cannot be deleted.',
      });
    }
    await this.database.client.query('DELETE FROM room_facilities WHERE id = $1', [id]);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'room_facility.delete',
      resourceType: 'room_facility',
      resourceId: id,
      beforeData: this.row(before),
      resultStatus: 'success',
      ...context,
    });
    return v2Data({ id, deleted: true });
  }

  async reorderRoomFacilities(
    user: UserAccessContext,
    dto: ReorderRoomFacilitiesDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    await this.reorder(
      'room_facilities',
      dto.property_id,
      dto.category_id ?? null,
      dto.items,
      'room_facility.reorder',
      user,
      context,
      dto.category_id ? 'category_id' : null,
    );
    return this.listRoomFacilities(user, {
      property_id: dto.property_id,
      category_id: dto.category_id,
      limit: 100,
      offset: 0,
    });
  }

  async listRules(user: UserAccessContext, query: ListKostTypeRulesQueryDto) {
    await this.properties.assertCanReadProperty(user, query.property_id);
    this.assertRuleScope(query.scope, query.kost_type_id);
    if (query.kost_type_id)
      await this.assertKostTypeProperty(query.kost_type_id, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<DbRow>(
      `SELECT rule.id, rule.property_id, rule.kost_type_id, rule.rule_category, rule.icon, rule.rule_text,
              rule.is_allowed, rule.sort_order, rule.created_at, rule.updated_at, COUNT(*) OVER()::int AS total
       FROM kost_type_rules rule
       WHERE rule.property_id = $1
         AND (($2::text = 'global' AND rule.kost_type_id IS NULL)
              OR ($2::text = 'kost_type' AND rule.kost_type_id = $3::uuid))
         AND ($4::text IS NULL OR rule.rule_category = $4)
       ORDER BY rule.sort_order, rule.created_at, rule.id
       LIMIT $5 OFFSET $6`,
      [
        query.property_id,
        query.scope,
        query.kost_type_id ?? null,
        query.rule_category ?? null,
        limit,
        offset,
      ],
    );
    return v2List(
      result.rows.map((row) => this.row(row)),
      limit,
      offset,
      Number(result.rows[0]?.total ?? 0),
    );
  }

  async createRule(
    user: UserAccessContext,
    dto: CreateKostTypeRuleDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    if (dto.kost_type_id) await this.assertKostTypeProperty(dto.kost_type_id, dto.property_id);
    const result = await this.database.client.query<DbRow>(
      `INSERT INTO kost_type_rules (
         property_id, kost_type_id, rule_category, icon, rule_text, is_allowed, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0)) RETURNING *`,
      [
        dto.property_id,
        dto.kost_type_id ?? null,
        dto.rule_category,
        dto.icon ?? null,
        dto.rule_text.trim(),
        dto.is_allowed ?? null,
        dto.sort_order ?? null,
      ],
    );
    const record = result.rows[0];
    await this.audit.write({
      actorUserId: user.id,
      propertyId: dto.property_id,
      action: 'kost_type_rule.create',
      resourceType: 'kost_type_rule',
      resourceId: String(record.id),
      afterData: this.row(record),
      resultStatus: 'success',
      ...context,
    });
    return v2Data(this.row(record));
  }

  async updateRule(
    user: UserAccessContext,
    id: string,
    dto: UpdateKostTypeRuleDto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireById('kost_type_rules', id, 'KOST_TYPE_RULE_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    const result = await this.database.client.query<DbRow>(
      `UPDATE kost_type_rules
       SET rule_category = COALESCE($2, rule_category), icon = COALESCE($3, icon),
           rule_text = COALESCE($4, rule_text), is_allowed = COALESCE($5, is_allowed),
           sort_order = COALESCE($6, sort_order), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        dto.rule_category ?? null,
        dto.icon ?? null,
        dto.rule_text?.trim() ?? null,
        dto.is_allowed ?? null,
        dto.sort_order ?? null,
      ],
    );
    const updated = result.rows[0];
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(updated.property_id),
      action: 'kost_type_rule.update',
      resourceType: 'kost_type_rule',
      resourceId: id,
      beforeData: this.row(before),
      afterData: this.row(updated),
      resultStatus: 'success',
      ...context,
    });
    return v2Data(this.row(updated));
  }

  async deleteRule(user: UserAccessContext, id: string, context: RequestAuditContext) {
    const before = await this.requireById('kost_type_rules', id, 'KOST_TYPE_RULE_NOT_FOUND');
    await this.assertCanMutate(user, String(before.property_id));
    await this.database.client.query('DELETE FROM kost_type_rules WHERE id = $1', [id]);
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'kost_type_rule.delete',
      resourceType: 'kost_type_rule',
      resourceId: id,
      beforeData: this.row(before),
      resultStatus: 'success',
      ...context,
    });
    return v2Data({ id, deleted: true });
  }

  async reorderRules(
    user: UserAccessContext,
    dto: ReorderKostTypeRulesDto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    const scope = dto.kost_type_id ?? null;
    if (scope) await this.assertKostTypeProperty(scope, dto.property_id);
    await this.reorder(
      'kost_type_rules',
      dto.property_id,
      scope,
      dto.items,
      'kost_type_rule.reorder',
      user,
      context,
      'kost_type_id',
    );
    return this.listRules(user, {
      property_id: dto.property_id,
      scope: scope ? 'kost_type' : 'global',
      kost_type_id: scope ?? undefined,
      limit: 100,
      offset: 0,
    });
  }

  private async kostTypeDetail(record: DbRow) {
    const [facilities, rules] = await Promise.all([
      this.database.client.query<DbRow>(
        `SELECT facility.id, facility.property_id, facility.category_id, facility.name, facility.icon,
                facility.description, facility.status, facility.sort_order
         FROM kost_type_facility_assignments assignment
         JOIN room_facilities facility ON facility.id = assignment.facility_id
         WHERE assignment.kost_type_id = $1
         ORDER BY facility.sort_order, facility.name`,
        [record.id],
      ),
      this.database.client.query<DbRow>(
        `SELECT id, property_id, kost_type_id, rule_category, icon, rule_text, is_allowed, sort_order
         FROM kost_type_rules
         WHERE property_id = $1 AND (kost_type_id IS NULL OR kost_type_id = $2)
         ORDER BY kost_type_id NULLS FIRST, sort_order, created_at`,
        [record.property_id, record.id],
      ),
    ]);
    return {
      ...this.kostTypeSummary(record),
      facilities: facilities.rows.map((row) => this.row(row)),
      rules: rules.rows.map((row) => this.row(row)),
    };
  }

  private kostTypeSummary(row: DbRow) {
    return this.row(row, [
      'monthly_price',
      'yearly_price',
      'deposit_amount',
      'room_size_m2',
      'room_count',
      'facility_count',
    ]);
  }

  private row(row: DbRow, numericKeys: string[] = []): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...row };
    for (const key of numericKeys) {
      if (typeof copy[key] === 'string') copy[key] = Number(copy[key]);
    }
    delete copy.total;
    return copy;
  }

  private auditKostType(row: DbRow) {
    const result = this.kostTypeSummary(row);
    delete result.created_at;
    delete result.updated_at;
    return result;
  }

  private async requireKostType(id: string): Promise<DbRow> {
    const result = await this.database.client.query<DbRow>(
      'SELECT * FROM kost_types WHERE id = $1',
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException({ code: 'KOST_TYPE_NOT_FOUND', message: 'Kost type not found.' });
    return result.rows[0];
  }

  private async requireById(
    table: 'facility_categories' | 'room_facilities' | 'kost_type_rules',
    id: string,
    code: string,
  ): Promise<DbRow> {
    const result = await this.database.client.query<DbRow>(`SELECT * FROM ${table} WHERE id = $1`, [
      id,
    ]);
    if (!result.rows[0]) throw new NotFoundException({ code, message: 'Resource not found.' });
    return result.rows[0];
  }

  private async assertKostTypeProperty(kostTypeId: string, propertyId: string): Promise<void> {
    const result = await this.database.client.query<{ property_id: string }>(
      'SELECT property_id FROM kost_types WHERE id = $1 AND deleted_at IS NULL',
      [kostTypeId],
    );
    if (!result.rows[0] || result.rows[0].property_id !== propertyId) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Kost type belongs to another property.',
      });
    }
  }

  private async assertFacilityCategoryProperty(
    categoryId: string,
    propertyId: string,
  ): Promise<void> {
    const result = await this.database.client.query<{ property_id: string }>(
      'SELECT property_id FROM facility_categories WHERE id = $1',
      [categoryId],
    );
    if (!result.rows[0] || result.rows[0].property_id !== propertyId) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Facility category belongs to another property.',
      });
    }
  }

  private async readScope(user: UserAccessContext, propertyId?: string): Promise<string[] | null> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return user.roles.includes('owner') ? null : [propertyId];
    }
    return user.roles.includes('owner') ? null : user.propertyIds;
  }

  private async assertCanMutate(user: UserAccessContext, propertyId: string): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate master data.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private assertLegacySnapshotRange(
    monthlyPrice: number,
    yearlyPrice: number,
    depositAmount: number,
  ): void {
    if (
      [monthlyPrice, yearlyPrice, depositAmount].some((amount) => amount > LEGACY_ROOM_PRICE_MAX)
    ) {
      throw new BadRequestException({
        code: 'LEGACY_ROOM_SNAPSHOT_RANGE',
        message: 'Kost type price cannot exceed the compatible room snapshot range.',
      });
    }
  }

  private async syncLegacyRoomSnapshots(
    client: PoolClient,
    kostTypeId: string,
    row: DbRow,
  ): Promise<void> {
    await client.query(
      `UPDATE rooms
       SET monthly_price = $2::integer, yearly_price = $3::integer, deposit_amount = $4::integer, updated_at = now()
       WHERE kost_type_id = $1
         AND (monthly_price IS DISTINCT FROM $2::integer OR yearly_price IS DISTINCT FROM $3::integer OR deposit_amount IS DISTINCT FROM $4::integer)`,
      [kostTypeId, Number(row.monthly_price), Number(row.yearly_price), Number(row.deposit_amount)],
    );
  }

  private async reorder(
    table: 'facility_categories' | 'room_facilities' | 'kost_type_rules',
    propertyId: string,
    scopeId: string | null,
    items: Array<{ id: string; sort_order: number }>,
    action: string,
    user: UserAccessContext,
    context: RequestAuditContext,
    scopeColumn: 'category_id' | 'kost_type_id' | null = null,
  ): Promise<void> {
    const ids = [...new Set(items.map((item) => item.id))];
    if (ids.length !== items.length) {
      throw new BadRequestException({
        code: 'REORDER_DUPLICATE_ITEM',
        message: 'Reorder item ids must be unique.',
      });
    }
    const filter = scopeColumn ? `AND ${scopeColumn} IS NOT DISTINCT FROM $3::uuid` : '';
    const rows = await this.database.client.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE property_id = $1 ${filter} ORDER BY id`,
      scopeColumn ? [propertyId, null, scopeId] : [propertyId],
    );
    if (rows.rows.length !== ids.length || rows.rows.some((row) => !ids.includes(row.id))) {
      throw new ConflictException({
        code: 'REORDER_TARGET_INCOMPLETE',
        message: 'Reorder must contain every item in its target.',
      });
    }
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          `UPDATE ${table} SET sort_order = $2, updated_at = now() WHERE id = $1`,
          [item.id, item.sort_order],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
    await this.audit.write({
      actorUserId: user.id,
      propertyId,
      action,
      resourceType: table,
      afterData: { scope_id: scopeId, items },
      resultStatus: 'success',
      ...context,
    });
  }

  private assertRuleScope(scope: 'global' | 'kost_type', kostTypeId?: string): void {
    if ((scope === 'global' && kostTypeId) || (scope === 'kost_type' && !kostTypeId)) {
      throw new BadRequestException({
        code: 'RULE_SCOPE_INVALID',
        message: 'Rule scope and kost_type_id are inconsistent.',
      });
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* transaction may not have started */
    }
  }

  private rethrowKostTypeConflict(error: unknown): never {
    this.rethrowUnique(
      error,
      'KOST_TYPE_ACTIVE_CATEGORY_EXISTS',
      'An active kost type already exists for this category.',
    );
  }

  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (this.databaseErrorCode(error) === '23505') {
      throw new ConflictException({ code, message });
    }
    throw error;
  }

  private databaseErrorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
