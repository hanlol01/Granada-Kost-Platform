import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
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
const INITIAL_MONTHLY_PRICE = 1_800_000;
const INITIAL_ANNUAL_CONTRACT_VALUE = 21_600_000;
const DEFAULT_PAYMENT_SCHEDULES = ['annual', 'two_month_installments'] as const;
const DEFAULT_MINIMUM_DP_PERCENT = 25;
const DEFAULT_SECURITY_DEPOSIT_MONTHS = 1;

type PaymentSchedule = (typeof DEFAULT_PAYMENT_SCHEDULES)[number];
type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: unknown;
};

@Injectable()
export class AdminUxMasterService {
  private readonly commercialWriteValidation = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
  });

  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async listKostTypes(user: UserAccessContext, query: ListKostTypesQueryDto) {
    const scope = await this.readScope(user, query.property_id);
    await this.assertCommercialReconciliation(scope, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<DbRow>(
      `SELECT
         kost_type.id, kost_type.property_id, kost_type.category, kost_type.name, kost_type.slug,
         kost_type.description_short, kost_type.description_long, kost_type.room_size_label,
         kost_type.room_size_m2, commercial_version.monthly_price,
         commercial_version.annual_contract_value AS yearly_price,
         (commercial_version.monthly_price * commercial_version.security_deposit_months)::bigint
           AS deposit_amount,
         commercial_version.effective_date::text AS effective_date,
         commercial_version.minimum_dp_percent,
         commercial_version.security_deposit_months, commercial_version.payment_schedules,
         future_version.effective_date::text AS future_effective_date,
         future_version.monthly_price AS future_monthly_price,
         future_version.annual_contract_value AS future_yearly_price,
         future_version.minimum_dp_percent AS future_minimum_dp_percent,
         future_version.security_deposit_months AS future_security_deposit_months,
         future_version.payment_schedules AS future_payment_schedules,
         kost_type.max_occupants, kost_type.public_visible,
         kost_type.notes, kost_type.status, kost_type.deleted_at, kost_type.created_at,
         kost_type.updated_at,
         COUNT(DISTINCT room.id)::int AS room_count,
         COUNT(DISTINCT assignment.facility_id)::int AS facility_count,
         COUNT(*) OVER()::int AS total
       FROM kost_types kost_type
       JOIN LATERAL (
         SELECT version.effective_date, version.monthly_price, version.annual_contract_value,
                version.minimum_dp_percent, version.security_deposit_months, version.payment_schedules
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date <= CURRENT_DATE
         ORDER BY version.effective_date DESC, version.id DESC
         LIMIT 1
       ) commercial_version ON true
       LEFT JOIN LATERAL (
         SELECT version.effective_date, version.monthly_price, version.annual_contract_value,
                version.minimum_dp_percent, version.security_deposit_months, version.payment_schedules
         FROM kost_type_commercial_versions version
         WHERE version.kost_type_id = kost_type.id
           AND version.effective_date > CURRENT_DATE
         ORDER BY version.effective_date, version.id
         LIMIT 1
       ) future_version ON true
       LEFT JOIN rooms room ON room.kost_type_id = kost_type.id
       LEFT JOIN kost_type_facility_assignments assignment ON assignment.kost_type_id = kost_type.id
       WHERE ($1::uuid[] IS NULL OR kost_type.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR kost_type.property_id = $2)
         AND ($3::text IS NULL OR kost_type.category = $3)
         AND ($4::text IS NULL OR kost_type.status = $4)
         AND ($5::boolean = true OR kost_type.deleted_at IS NULL)
         AND ($6::text IS NULL OR kost_type.name ILIKE '%' || $6 || '%' OR kost_type.slug ILIKE '%' || $6 || '%')
        GROUP BY kost_type.id,
                 commercial_version.effective_date,
                 commercial_version.monthly_price,
                 commercial_version.annual_contract_value,
                 commercial_version.minimum_dp_percent,
                 commercial_version.security_deposit_months,
                 commercial_version.payment_schedules,
                 future_version.effective_date,
                 future_version.monthly_price,
                 future_version.annual_contract_value,
                 future_version.minimum_dp_percent,
                 future_version.security_deposit_months,
                 future_version.payment_schedules
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
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validateCommercialBody(CreateKostTypeDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const commercial = this.validateCommercialInput(dto);
    if (
      commercial.monthlyPrice !== INITIAL_MONTHLY_PRICE ||
      commercial.annualContractValue !== INITIAL_ANNUAL_CONTRACT_VALUE
    ) {
      throw new BadRequestException({
        code: 'KOST_TYPE_INITIAL_RATE_INVALID',
        message: 'Initial category rates must use the approved commercial baseline.',
      });
    }
    const effectiveDate = this.effectiveDate(dto.effective_date);
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const today = await this.databaseToday(client);
      if (effectiveDate > today) {
        throw new BadRequestException({
          code: 'KOST_TYPE_INITIAL_EFFECTIVE_DATE_INVALID',
          message: 'Initial commercial authority cannot start in the future.',
        });
      }
      const replay = await this.claimKostTypeCommand(
        client,
        dto.property_id,
        user.id,
        '/kost-types',
        key,
        this.requestFingerprint(dto),
        context.correlationId,
      );
      if (replay) {
        await client.query('COMMIT');
        return replay as { data: Record<string, unknown> };
      }
      const result = await client.query<DbRow>(
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
          commercial.monthlyPrice,
          commercial.annualContractValue,
          commercial.monthlyPrice * commercial.securityDepositMonths,
          dto.public_visible ?? null,
          dto.notes ?? null,
          dto.status ?? null,
          user.id,
        ],
      );
      const record = result.rows[0];
      await client.query(
        `INSERT INTO kost_type_commercial_versions (
           kost_type_id, effective_date, monthly_price, annual_contract_value,
           minimum_dp_percent, security_deposit_months, payment_schedules,
           created_by_user_id, updated_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          record.id,
          effectiveDate,
          commercial.monthlyPrice,
          commercial.annualContractValue,
          commercial.minimumDpPercent,
          commercial.securityDepositMonths,
          commercial.paymentSchedules,
          user.id,
        ],
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'kost_type.create',
          resourceType: 'kost_type',
          resourceId: String(record.id),
          afterData: this.auditKostType(
            this.mergeCommercial(record, {
              effective_date: effectiveDate,
              monthly_price: commercial.monthlyPrice,
              annual_contract_value: commercial.annualContractValue,
              minimum_dp_percent: commercial.minimumDpPercent,
              security_deposit_months: commercial.securityDepositMonths,
              payment_schedules: commercial.paymentSchedules,
            }),
          ),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      const response = v2Data(await this.kostTypeDetail(record, client));
      await this.completeKostTypeCommand(
        client,
        user.id,
        '/kost-types',
        key,
        response,
        String(record.id),
        201,
      );
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await this.rollback(client);
      this.rethrowKostTypeConflict(error);
    } finally {
      client.release();
    }
  }

  async updateKostType(
    user: UserAccessContext,
    id: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validateCommercialBody(UpdateKostTypeDto, body);
    if (dto.category !== undefined) {
      throw new BadRequestException({
        code: 'KOST_TYPE_CATEGORY_IMMUTABLE',
        message: 'Kost type category cannot be changed.',
      });
    }
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const commercialChange = [
      dto.monthly_price,
      dto.yearly_price,
      dto.security_deposit_months,
      dto.payment_schedules,
      dto.effective_date,
    ].some((value) => value !== undefined);
    if (commercialChange && dto.effective_date === undefined) {
      throw new BadRequestException({
        code: 'KOST_TYPE_EFFECTIVE_DATE_REQUIRED',
        message: 'Commercial updates require an effective date.',
      });
    }
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const before = await this.lockKostTypeForCommercialUpdate(client, id, dto.property_id);
      const route = `/kost-types/${id}`;
      const replay = await this.claimKostTypeCommand(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.requestFingerprint(dto),
        context.correlationId,
      );
      if (replay) {
        await client.query('COMMIT');
        return replay as { data: Record<string, unknown> };
      }
      const today = await this.databaseToday(client);
      const versions = await this.lockCommercialVersions(client, id);
      const current = this.currentCommercialFromLockedVersions(versions, today);
      const effectiveDate = commercialChange
        ? this.effectiveDate(dto.effective_date)
        : String(current.effective_date).slice(0, 10);
      const futureVersions = versions.filter(
        (version) => String(version.effective_date).slice(0, 10) > today,
      );
      const scheduledVersion = futureVersions.find(
        (version) => String(version.effective_date).slice(0, 10) === effectiveDate,
      );
      // A partial edit must retain values from the scheduled version, if any;
      // otherwise an omitted monthly/yearly field would silently revert to the
      // currently active rate while revising the future schedule.
      const commercial = this.validateCommercialInput(
        dto,
        this.mergeCommercial(before, scheduledVersion ?? current),
      );
      if (commercialChange && effectiveDate <= today) {
        throw new BadRequestException({
          code: 'KOST_TYPE_EFFECTIVE_DATE_NOT_FUTURE',
          message: 'Commercial updates must start after the current business date.',
        });
      }
      if (
        commercialChange &&
        futureVersions.length > 0 &&
        (futureVersions.length > 1 || !scheduledVersion)
      ) {
        throw new ConflictException({
          code: 'KOST_TYPE_FUTURE_COMMERCIAL_CONFLICT',
          message: 'A future commercial version is already scheduled.',
        });
      }
      const result = await client.query<DbRow>(
        `UPDATE kost_types
         SET name = COALESCE($2, name),
             slug = COALESCE($3, slug),
             description_short = COALESCE($4, description_short),
             description_long = COALESCE($5, description_long),
             room_size_label = COALESCE($6, room_size_label),
             room_size_m2 = COALESCE($7, room_size_m2),
             public_visible = COALESCE($8, public_visible),
             notes = COALESCE($9, notes),
             status = COALESCE($10, status),
             updated_by_user_id = $11,
             updated_at = now()
         WHERE id = $1 AND property_id = $12 AND deleted_at IS NULL
         RETURNING *`,
        [
          id,
          dto.name?.trim() ?? null,
          dto.slug?.trim().toLowerCase() ?? null,
          dto.description_short ?? null,
          dto.description_long ?? null,
          dto.room_size_label ?? null,
          dto.room_size_m2 ?? null,
          dto.public_visible ?? null,
          dto.notes ?? null,
          dto.status ?? null,
          user.id,
          dto.property_id,
        ],
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new NotFoundException({
          code: 'KOST_TYPE_NOT_FOUND',
          message: 'Kost type not found.',
        });
      }
      if (commercialChange) {
        if (scheduledVersion) {
          await client.query(
            `UPDATE kost_type_commercial_versions
             SET monthly_price = $3,
                 annual_contract_value = $4,
                 minimum_dp_percent = $5,
                 security_deposit_months = $6,
                 payment_schedules = $7,
                 updated_by_user_id = $8,
                 updated_at = now()
             WHERE kost_type_id = $1 AND effective_date = $2`,
            [
              id,
              effectiveDate,
              commercial.monthlyPrice,
              commercial.annualContractValue,
              DEFAULT_MINIMUM_DP_PERCENT,
              commercial.securityDepositMonths,
              commercial.paymentSchedules,
              user.id,
            ],
          );
        } else {
          await client.query(
            `INSERT INTO kost_type_commercial_versions (
               kost_type_id, effective_date, monthly_price, annual_contract_value,
               minimum_dp_percent, security_deposit_months, payment_schedules,
               created_by_user_id, updated_by_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
            [
              id,
              effectiveDate,
              commercial.monthlyPrice,
              commercial.annualContractValue,
              DEFAULT_MINIMUM_DP_PERCENT,
              commercial.securityDepositMonths,
              commercial.paymentSchedules,
              user.id,
            ],
          );
        }
      }
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: String(updated.property_id),
          action: 'kost_type.update',
          resourceType: 'kost_type',
          resourceId: id,
          beforeData: this.auditKostType(this.mergeCommercial(before, current)),
          afterData: this.auditKostType(
            this.mergeCommercial(updated, {
              effective_date: effectiveDate,
              monthly_price: commercial.monthlyPrice,
              annual_contract_value: commercial.annualContractValue,
              minimum_dp_percent: commercial.minimumDpPercent,
              security_deposit_months: commercial.securityDepositMonths,
              payment_schedules: commercial.paymentSchedules,
            }),
          ),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      const response = v2Data(await this.kostTypeDetail(updated, client));
      await this.completeKostTypeCommand(client, user.id, route, key, response, id, 200);
      await client.query('COMMIT');
      return response;
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

  private async kostTypeDetail(record: DbRow, client?: PoolClient) {
    const executor = client ?? this.database.client;
    const [commercial, futureCommercial, facilities, rules] = await Promise.all([
      this.currentCommercial(String(record.id), client),
      this.nextCommercial(String(record.id), client),
      executor.query<DbRow>(
        `SELECT facility.id, facility.property_id, facility.category_id, facility.name, facility.icon,
                facility.description, facility.status, facility.sort_order
         FROM kost_type_facility_assignments assignment
         JOIN room_facilities facility ON facility.id = assignment.facility_id
         WHERE assignment.kost_type_id = $1
         ORDER BY facility.sort_order, facility.name`,
        [record.id],
      ),
      executor.query<DbRow>(
        `SELECT id, property_id, kost_type_id, rule_category, icon, rule_text, is_allowed, sort_order
         FROM kost_type_rules
         WHERE property_id = $1 AND (kost_type_id IS NULL OR kost_type_id = $2)
         ORDER BY kost_type_id NULLS FIRST, sort_order, created_at`,
        [record.property_id, record.id],
      ),
    ]);
    const current = this.mergeFutureCommercial(
      this.mergeCommercial(record, commercial),
      futureCommercial,
    );
    return {
      ...this.kostTypeSummary(current),
      facilities: facilities.rows.map((row) => this.row(row)),
      rules: rules.rows.map((row) => this.row(row)),
    };
  }

  private kostTypeSummary(row: DbRow) {
    const result: Record<string, unknown> = {
      id: row.id,
      property_id: row.property_id,
      category: row.category,
      name: row.name,
      slug: row.slug,
      description_short: row.description_short ?? null,
      description_long: row.description_long ?? null,
      room_size_label: row.room_size_label ?? null,
      room_size_m2: row.room_size_m2 === null ? null : Number(row.room_size_m2),
      monthly_price: Number(row.monthly_price),
      yearly_price: Number(row.yearly_price),
      deposit_amount: Number(row.deposit_amount),
      max_occupants: Number(row.max_occupants ?? 1),
      public_visible: Boolean(row.public_visible),
      notes: row.notes ?? null,
      status: row.status,
      deleted_at: row.deleted_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      commercial: {
        monthly_price: Number(row.monthly_price),
        annual_contract_value: Number(row.yearly_price),
        minimum_dp_percent: Number(row.minimum_dp_percent ?? DEFAULT_MINIMUM_DP_PERCENT),
        minimum_dp_amount: Math.ceil(
          (Number(row.yearly_price) *
            Number(row.minimum_dp_percent ?? DEFAULT_MINIMUM_DP_PERCENT)) /
            100,
        ),
        payment_schedules: this.paymentSchedules(row.payment_schedules),
        security_deposit_months: Number(
          row.security_deposit_months ?? DEFAULT_SECURITY_DEPOSIT_MONTHS,
        ),
        security_deposit_required:
          Number(row.monthly_price) *
          Number(row.security_deposit_months ?? DEFAULT_SECURITY_DEPOSIT_MONTHS),
        effective_date: String(row.effective_date).slice(0, 10),
      },
      future_commercial: this.futureCommercialSummary(row),
    };
    if (row.room_count !== undefined) result.room_count = Number(row.room_count);
    if (row.facility_count !== undefined) result.facility_count = Number(row.facility_count);
    return result;
  }

  private async currentCommercial(kostTypeId: string, client?: PoolClient): Promise<DbRow> {
    const result = await (client ?? this.database.client).query<DbRow>(
      `SELECT effective_date::text AS effective_date,
              monthly_price, annual_contract_value, minimum_dp_percent,
              security_deposit_months, payment_schedules
       FROM kost_type_commercial_versions
       WHERE kost_type_id = $1 AND effective_date <= CURRENT_DATE
       ORDER BY effective_date DESC, id DESC
       LIMIT 1`,
      [kostTypeId],
    );
    if (!result.rows[0]) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_AUTHORITY_MISSING',
        message: 'Kost type commercial authority is unavailable.',
      });
    }
    return result.rows[0];
  }

  private async nextCommercial(kostTypeId: string, client?: PoolClient): Promise<DbRow | null> {
    const result = await (client ?? this.database.client).query<DbRow>(
      `SELECT effective_date::text AS effective_date,
              monthly_price, annual_contract_value, minimum_dp_percent,
              security_deposit_months, payment_schedules
       FROM kost_type_commercial_versions
       WHERE kost_type_id = $1 AND effective_date > CURRENT_DATE
       ORDER BY effective_date, id
       LIMIT 2`,
      [kostTypeId],
    );
    if (result.rows.length > 1) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED',
        message: 'Multiple future commercial versions require reconciliation.',
      });
    }
    return result.rows[0] ?? null;
  }

  private mergeCommercial(record: DbRow, commercial: DbRow): DbRow {
    return {
      ...record,
      effective_date: commercial.effective_date,
      monthly_price: commercial.monthly_price,
      yearly_price: commercial.annual_contract_value,
      deposit_amount: Number(commercial.monthly_price) * Number(commercial.security_deposit_months),
      minimum_dp_percent: commercial.minimum_dp_percent,
      security_deposit_months: commercial.security_deposit_months,
      payment_schedules: commercial.payment_schedules,
    };
  }

  private mergeFutureCommercial(record: DbRow, commercial: DbRow | null): DbRow {
    return {
      ...record,
      future_effective_date: commercial?.effective_date ?? null,
      future_monthly_price: commercial?.monthly_price ?? null,
      future_yearly_price: commercial?.annual_contract_value ?? null,
      future_minimum_dp_percent: commercial?.minimum_dp_percent ?? null,
      future_security_deposit_months: commercial?.security_deposit_months ?? null,
      future_payment_schedules: commercial?.payment_schedules ?? null,
    };
  }

  private futureCommercialSummary(row: DbRow): Record<string, unknown> | null {
    if (row.future_effective_date === null || row.future_effective_date === undefined) {
      return null;
    }
    const futureEffectiveDate = row.future_effective_date;
    if (typeof futureEffectiveDate !== 'string' && !(futureEffectiveDate instanceof Date)) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED',
        message: 'Future category commercial authority is invalid.',
      });
    }
    const monthlyPrice = Number(row.future_monthly_price);
    const annualContractValue = Number(row.future_yearly_price);
    const minimumDpPercent = Number(row.future_minimum_dp_percent);
    const securityDepositMonths = Number(row.future_security_deposit_months);
    return {
      monthly_price: monthlyPrice,
      annual_contract_value: annualContractValue,
      minimum_dp_percent: minimumDpPercent,
      minimum_dp_amount: Math.ceil((annualContractValue * minimumDpPercent) / 100),
      payment_schedules: this.paymentSchedules(row.future_payment_schedules),
      security_deposit_months: securityDepositMonths,
      security_deposit_required: monthlyPrice * securityDepositMonths,
      effective_date:
        futureEffectiveDate instanceof Date
          ? futureEffectiveDate.toISOString().slice(0, 10)
          : futureEffectiveDate.slice(0, 10),
    };
  }

  private paymentSchedules(value: unknown): PaymentSchedule[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((item) => !DEFAULT_PAYMENT_SCHEDULES.includes(item as PaymentSchedule)) ||
      new Set(value).size !== value.length
    ) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_AUTHORITY_INVALID',
        message: 'Kost type payment schedule authority is invalid.',
      });
    }
    return [...new Set(value as PaymentSchedule[])];
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
    return {
      id: row.id,
      property_id: row.property_id,
      category: row.category,
      effective_date: row.effective_date ?? null,
      monthly_price: row.monthly_price ?? null,
      yearly_price: row.yearly_price ?? null,
      minimum_dp_percent: row.minimum_dp_percent ?? DEFAULT_MINIMUM_DP_PERCENT,
      security_deposit_months: row.security_deposit_months ?? DEFAULT_SECURITY_DEPOSIT_MONTHS,
      payment_schedules: row.payment_schedules ?? DEFAULT_PAYMENT_SCHEDULES,
    };
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

  private async assertCommercialReconciliation(
    propertyScope: string[] | null,
    propertyId?: string,
  ): Promise<void> {
    const result = await this.database.client.query<{ drift: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM properties property
         WHERE property.status = 'active'
           AND ($1::uuid[] IS NULL OR property.id = ANY($1::uuid[]))
           AND ($2::uuid IS NULL OR property.id = $2)
           AND (
             (SELECT COUNT(*) FROM kost_types kost_type
              WHERE kost_type.property_id = property.id
                AND kost_type.status = 'active' AND kost_type.deleted_at IS NULL) <> 2
             OR EXISTS (
               SELECT 1
               FROM kost_types reconciliation_type
               WHERE reconciliation_type.property_id = property.id
                 AND reconciliation_type.status = 'active'
                 AND reconciliation_type.deleted_at IS NULL
                 AND (
                   NOT EXISTS (
                     SELECT 1
                     FROM kost_type_commercial_versions current_version
                     WHERE current_version.kost_type_id = reconciliation_type.id
                       AND current_version.effective_date <= CURRENT_DATE
                   )
                   OR (
                     SELECT COUNT(*)
                     FROM kost_type_commercial_versions future_version
                     WHERE future_version.kost_type_id = reconciliation_type.id
                       AND future_version.effective_date > CURRENT_DATE
                   ) > 1
                 )
             )
             OR EXISTS (
               SELECT 1
               FROM rooms room
               LEFT JOIN kost_types kost_type
                 ON kost_type.id = room.kost_type_id
                AND kost_type.property_id = room.property_id
                AND kost_type.category = room.category
                AND kost_type.deleted_at IS NULL
               WHERE room.property_id = property.id
                 AND (
                   kost_type.id IS NULL OR NOT EXISTS (
                     SELECT 1 FROM kost_type_commercial_versions version
                     WHERE version.kost_type_id = kost_type.id
                       AND version.effective_date <= CURRENT_DATE
                   )
                 )
             )
           )
       ) AS drift`,
      [propertyScope, propertyId ?? null],
    );
    if (result.rows[0]?.drift) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_RECONCILIATION_REQUIRED',
        message: 'Category commercial authority requires reconciliation.',
      });
    }
  }

  private effectiveDate(value?: string): string {
    if (value === undefined) return new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException({
        code: 'KOST_TYPE_EFFECTIVE_DATE_INVALID',
        message: 'Effective date must use YYYY-MM-DD.',
      });
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException({
        code: 'KOST_TYPE_EFFECTIVE_DATE_INVALID',
        message: 'Effective date is invalid.',
      });
    }
    return value;
  }

  private validateCommercialInput(
    dto: Pick<
      CreateKostTypeDto | UpdateKostTypeDto,
      'monthly_price' | 'yearly_price' | 'security_deposit_months' | 'payment_schedules'
    >,
    fallback?: DbRow,
  ) {
    const monthlyPrice = dto.monthly_price ?? Number(fallback?.monthly_price ?? 0);
    const annualContractValue = dto.yearly_price ?? Number(fallback?.yearly_price ?? 0);
    const minimumDpPercent = DEFAULT_MINIMUM_DP_PERCENT;
    const securityDepositMonths =
      dto.security_deposit_months ??
      Number(fallback?.security_deposit_months ?? DEFAULT_SECURITY_DEPOSIT_MONTHS);
    const paymentSchedules = this.paymentSchedules(
      dto.payment_schedules ?? fallback?.payment_schedules ?? DEFAULT_PAYMENT_SCHEDULES,
    );
    if (
      !Number.isInteger(monthlyPrice) ||
      !Number.isInteger(annualContractValue) ||
      monthlyPrice <= 0 ||
      annualContractValue <= 0 ||
      !Number.isInteger(securityDepositMonths) ||
      securityDepositMonths < 1 ||
      securityDepositMonths > 2
    ) {
      throw new BadRequestException({
        code: 'KOST_TYPE_COMMERCIAL_INPUT_INVALID',
        message: 'Commercial authority values are invalid.',
      });
    }
    this.assertLegacySnapshotRange(
      monthlyPrice,
      annualContractValue,
      monthlyPrice * securityDepositMonths,
    );
    return {
      monthlyPrice,
      annualContractValue,
      minimumDpPercent,
      securityDepositMonths,
      paymentSchedules,
    };
  }

  private validateCommercialBody<T extends object>(
    metatype: new () => T,
    value: unknown,
  ): Promise<T> {
    return this.commercialWriteValidation.transform(value, {
      type: 'body',
      metatype,
    }) as Promise<T>;
  }

  private requireIdempotencyKey(value?: string): string {
    const key = value?.trim();
    if (!key || key.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
    return key;
  }

  private async databaseToday(client: PoolClient): Promise<string> {
    const result = await client.query<{ today: string }>(
      `SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS today`,
    );
    return result.rows[0].today;
  }

  private async lockKostTypeForCommercialUpdate(
    client: PoolClient,
    id: string,
    propertyId: string,
  ): Promise<DbRow> {
    const result = await client.query<DbRow>(
      `SELECT *
       FROM kost_types
       WHERE id = $1 AND property_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, propertyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'KOST_TYPE_NOT_FOUND',
        message: 'Kost type not found.',
      });
    }
    return result.rows[0];
  }

  private async lockCommercialVersions(client: PoolClient, kostTypeId: string): Promise<DbRow[]> {
    const result = await client.query<DbRow>(
      `SELECT effective_date::text AS effective_date,
              monthly_price, annual_contract_value, minimum_dp_percent,
              security_deposit_months, payment_schedules
       FROM kost_type_commercial_versions
       WHERE kost_type_id = $1
       ORDER BY effective_date, id
       FOR UPDATE`,
      [kostTypeId],
    );
    return result.rows;
  }

  private currentCommercialFromLockedVersions(versions: DbRow[], today: string): DbRow {
    const current = versions
      .filter((version) => String(version.effective_date).slice(0, 10) <= today)
      .at(-1);
    if (!current) {
      throw new ConflictException({
        code: 'KOST_TYPE_COMMERCIAL_AUTHORITY_MISSING',
        message: 'Kost type commercial authority is unavailable.',
      });
    }
    return current;
  }

  private requestFingerprint(payload: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(this.canonicalFingerprintValue(payload)))
      .digest('hex');
  }

  private canonicalFingerprintValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalFingerprintValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalFingerprintValue(item)]),
      );
    }
    return value;
  }

  private async claimKostTypeCommand(
    client: PoolClient,
    propertyId: string,
    actorUserId: string,
    route: string,
    key: string,
    fingerprint: string,
    correlationId?: string,
  ): Promise<unknown> {
    const inserted = await client.query<IdempotencyRow>(
      `INSERT INTO idempotency_commands (
         property_id, actor_user_id, route, idempotency_key, request_fingerprint, correlation_id
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (actor_user_id, route, idempotency_key) DO NOTHING
       RETURNING request_fingerprint, command_status, response_body`,
      [propertyId, actorUserId, route, key, fingerprint, correlationId ?? null],
    );
    if (inserted.rows[0]) return null;
    const existing = await client.query<IdempotencyRow>(
      `SELECT request_fingerprint, command_status, response_body
       FROM idempotency_commands
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [actorUserId, route, key],
    );
    const command = existing.rows[0];
    if (!command || command.command_status === 'pending') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: 'The commercial update is still being processed.',
      });
    }
    if (command.request_fingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key was already used with a different payload.',
      });
    }
    if (!command.response_body || typeof command.response_body !== 'object') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESPONSE_UNAVAILABLE',
        message: 'The previous commercial update response is unavailable.',
      });
    }
    return command.response_body;
  }

  private async completeKostTypeCommand(
    client: PoolClient,
    actorUserId: string,
    route: string,
    key: string,
    body: unknown,
    resourceId: string,
    responseStatus: 200 | 201,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = 'succeeded', response_status = $6, response_body = $4::jsonb,
           resource_type = 'kost_type', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorUserId, route, key, JSON.stringify(body), resourceId, responseStatus],
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
    if (
      this.databaseErrorCode(error) === '23505' &&
      this.databaseErrorConstraint(error) === 'kost_type_commercial_versions_unique_effective'
    ) {
      throw new ConflictException({
        code: 'KOST_TYPE_EFFECTIVE_DATE_CONFLICT',
        message: 'A commercial version already exists for this effective date.',
      });
    }
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

  private databaseErrorConstraint(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'constraint' in error
      ? String(error.constraint)
      : undefined;
  }
}
