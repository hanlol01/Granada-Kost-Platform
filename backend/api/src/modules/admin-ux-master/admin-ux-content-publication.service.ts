import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { v2Data } from '../../shared/admin-ux-v2';
import type { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  PublishCategoryContentDto,
  PublishPropertyPolicyDto,
  ReplaceCategoryFacilitiesDto,
  RestoreCategoryContentDto,
  RestorePropertyPolicyDto,
  SavePropertyPolicyDraftDto,
  UnpublishCategoryContentDto,
  UnpublishPropertyPolicyDto,
} from './admin-ux-master.dto';

type Row = Record<string, unknown>;
type DtoClass<T extends object> = new () => T;
type ContentType = 'facilities' | 'gallery';
type Category = 'rukost' | 'apartkost';
type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: unknown;
};

const CATEGORY_LABEL: Record<Category, string> = {
  rukost: 'Rumah Kost',
  apartkost: 'Apart Kost',
};
const PUBLIC_IMAGE_MAX_DIMENSION = 1920;

@Injectable()
export class AdminUxContentPublicationService {
  private readonly strictValidation = new ValidationPipe({
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

  async categoryWorkspace(user: UserAccessContext, propertyId: string, kostTypeId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    const type = await this.requireCategory(propertyId, kostTypeId);
    await this.assertExactlyTwoCategories(propertyId);
    const [facilities, gallery, versions] = await Promise.all([
      this.database.client.query<Row>(
        `SELECT id, label, normalized_label, public_description, sort_order, content_state,
                public_visible, created_at, updated_at
         FROM kost_type_content_facilities
         WHERE property_id = $1 AND kost_type_id = $2
         ORDER BY content_state, sort_order, normalized_label, id`,
        [propertyId, kostTypeId],
      ),
      this.database.client.query<Row>(
        `SELECT image.id, image.file_id, image.public_derivative_file_id, image.alt_text,
                image.caption, image.sort_order, image.is_cover, image.content_state,
                image.created_at, image.updated_at,
                source.metadata AS source_metadata, derivative.metadata AS derivative_metadata
         FROM hunian_gallery_images image
         JOIN files source ON source.id = image.file_id
         LEFT JOIN files derivative ON derivative.id = image.public_derivative_file_id
         WHERE image.property_id = $1
           AND image.kost_type_id = $2
           AND image.target_type = 'kost_type'
           AND image.deleted_at IS NULL
         ORDER BY image.content_state, image.is_cover DESC, image.sort_order, image.id`,
        [propertyId, kostTypeId],
      ),
      this.database.client.query<Row>(
        `SELECT id, content_type, version, publication_status, effective_date,
                restored_from_version_id, published_at, published_by_user_id, created_at
         FROM kost_type_content_versions
         WHERE property_id = $1 AND kost_type_id = $2
         ORDER BY content_type, version DESC`,
        [propertyId, kostTypeId],
      ),
    ]);
    return v2Data({
      property_id: propertyId,
      kost_type_id: kostTypeId,
      category: {
        category: type.category,
        label: CATEGORY_LABEL[type.category],
      },
      facilities: facilities.rows.map((row) => this.facilityResponse(row)),
      gallery: gallery.rows.map((row) => this.galleryResponse(row)),
      publication: this.publicationState(versions.rows),
    });
  }

  async replaceFacilities(
    user: UserAccessContext,
    kostTypeId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(ReplaceCategoryFacilitiesDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    const normalized = dto.items.map((item, index) => ({
      ...item,
      label: item.label.trim().replace(/\s+/g, ' '),
      normalized_label: this.normalizeLabel(item.label),
      public_description: item.public_description?.trim() || null,
      sort_order: index,
      public_visible: item.content_state === 'active' && item.public_visible,
    }));
    if (new Set(normalized.map((item) => item.normalized_label)).size !== normalized.length) {
      throw new ConflictException({
        code: 'CATEGORY_FACILITY_DUPLICATE_LABEL',
        message: 'Facility labels must be unique within the category.',
      });
    }
    return this.database.transaction(async (client) => {
      const type = await this.lockCategory(client, dto.property_id, kostTypeId);
      const route = `/kost-types/${kostTypeId}/content/facilities`;
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(normalized),
        context.correlationId,
      );
      if (replay) return replay;
      const current = await client.query<Row>(
        `SELECT id FROM kost_type_content_facilities
         WHERE property_id = $1 AND kost_type_id = $2 AND archived_at IS NULL
         FOR UPDATE`,
        [dto.property_id, kostTypeId],
      );
      await client.query(
        `UPDATE kost_type_content_facilities
         SET sort_order = sort_order + 1000000, updated_by_user_id = $3, updated_at = now()
         WHERE property_id = $1 AND kost_type_id = $2 AND archived_at IS NULL`,
        [dto.property_id, kostTypeId, user.id],
      );
      const retained = normalized.flatMap((item) => (item.id ? [item.id] : []));
      await client.query(
        `UPDATE kost_type_content_facilities
         SET content_state = 'archived', archived_at = now(), public_visible = false,
             updated_by_user_id = $3, updated_at = now()
         WHERE property_id = $1 AND kost_type_id = $2
           AND archived_at IS NULL
           AND NOT (id = ANY($4::uuid[]))`,
        [dto.property_id, kostTypeId, user.id, retained],
      );
      for (const item of normalized) {
        if (item.id) {
          const result = await client.query<Row>(
            `UPDATE kost_type_content_facilities
             SET label = $4, normalized_label = $5, public_description = $6,
                 sort_order = $7, content_state = $8, public_visible = $9,
                 archived_at = CASE WHEN $8 = 'archived' THEN COALESCE(archived_at, now()) ELSE NULL END,
                 updated_by_user_id = $10, updated_at = now()
             WHERE id = $3 AND property_id = $1 AND kost_type_id = $2
             RETURNING id`,
            [
              dto.property_id,
              kostTypeId,
              item.id,
              item.label,
              item.normalized_label,
              item.public_description,
              item.sort_order,
              item.content_state,
              item.public_visible,
              user.id,
            ],
          );
          if (!result.rows[0]) {
            throw new UnprocessableEntityException({
              code: 'CATEGORY_FACILITY_SCOPE_MISMATCH',
              message: 'Facility belongs to another property or category.',
            });
          }
        } else {
          await client.query(
            `INSERT INTO kost_type_content_facilities (
               property_id, kost_type_id, label, normalized_label, public_description,
               sort_order, content_state, public_visible, created_by_user_id, updated_by_user_id,
               archived_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,
               CASE WHEN $7 = 'archived' THEN now() ELSE NULL END)`,
            [
              dto.property_id,
              kostTypeId,
              item.label,
              item.normalized_label,
              item.public_description,
              item.sort_order,
              item.content_state,
              item.public_visible,
              user.id,
            ],
          );
        }
      }
      const response = await this.categoryWorkspaceWithClient(
        client,
        dto.property_id,
        kostTypeId,
        type,
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'kost_type_content.facilities_replace',
          resourceType: 'kost_type',
          resourceId: kostTypeId,
          beforeData: { facility_count: current.rows.length, category: type.category },
          afterData: { facility_count: normalized.length, category: type.category },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, kostTypeId, 200);
      return response;
    });
  }

  async publishCategory(
    user: UserAccessContext,
    kostTypeId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(PublishCategoryContentDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const type = await this.lockCategory(client, dto.property_id, kostTypeId);
      await this.assertEffectiveDate(client, dto.effective_date);
      const route = `/kost-types/${kostTypeId}/content/publish`;
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      await this.assertNoFuturePublication(client, dto.property_id, kostTypeId, dto.content_type);
      await this.assertNoPublicationAtEffectiveDate(
        client,
        dto.property_id,
        kostTypeId,
        dto.content_type,
        dto.effective_date,
      );
      const payload =
        dto.content_type === 'facilities'
          ? await this.facilitySnapshot(client, dto.property_id, kostTypeId)
          : await this.gallerySnapshot(client, dto.property_id, kostTypeId);
      const versionResult = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
         FROM kost_type_content_versions
         WHERE kost_type_id = $1 AND content_type = $2`,
        [kostTypeId, dto.content_type],
      );
      const version = Number(versionResult.rows[0]?.version ?? 1);
      const inserted = await client.query<Row>(
        `INSERT INTO kost_type_content_versions (
           property_id, kost_type_id, content_type, version, publication_status,
           effective_date, payload, published_by_user_id
         ) VALUES ($1,$2,$3,$4,'published',$5,$6::jsonb,$7)
         RETURNING id, content_type, version, publication_status, effective_date,
                   published_at, published_by_user_id`,
        [
          dto.property_id,
          kostTypeId,
          dto.content_type,
          version,
          dto.effective_date.slice(0, 10),
          JSON.stringify(payload),
          user.id,
        ],
      );
      const response = await this.categoryWorkspaceWithClient(
        client,
        dto.property_id,
        kostTypeId,
        type,
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: `kost_type_content.${dto.content_type}_publish`,
          resourceType: 'kost_type_content_version',
          resourceId: String(inserted.rows[0].id),
          afterData: {
            category: type.category,
            content_type: dto.content_type,
            version,
            effective_date: dto.effective_date.slice(0, 10),
            item_count: Array.isArray(payload.items) ? payload.items.length : 0,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, String(inserted.rows[0].id), 201);
      return response;
    });
  }

  async unpublishCategory(
    user: UserAccessContext,
    kostTypeId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(UnpublishCategoryContentDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const type = await this.lockCategory(client, dto.property_id, kostTypeId);
      const route = `/kost-types/${kostTypeId}/content/unpublish`;
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const archived = await client.query<Row>(
        `UPDATE kost_type_content_versions
         SET publication_status = 'archived', archived_at = now()
         WHERE property_id = $1 AND kost_type_id = $2 AND content_type = $3
           AND publication_status = 'published'
         RETURNING id`,
        [dto.property_id, kostTypeId, dto.content_type],
      );
      if (!archived.rows.length) {
        throw new ConflictException({
          code: 'CATEGORY_CONTENT_NOT_PUBLISHED',
          message: 'No published category content is available to unpublish.',
        });
      }
      const response = await this.categoryWorkspaceWithClient(
        client,
        dto.property_id,
        kostTypeId,
        type,
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: `kost_type_content.${dto.content_type}_unpublish`,
          resourceType: 'kost_type',
          resourceId: kostTypeId,
          afterData: {
            category: type.category,
            content_type: dto.content_type,
            archived_version_count: archived.rows.length,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, kostTypeId, 200);
      return response;
    });
  }

  async restoreCategory(
    user: UserAccessContext,
    kostTypeId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(RestoreCategoryContentDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const type = await this.lockCategory(client, dto.property_id, kostTypeId);
      const route = `/kost-types/${kostTypeId}/content/restore`;
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const historical = await client.query<Row>(
        `SELECT id, content_type, payload
         FROM kost_type_content_versions
         WHERE id = $1 AND property_id = $2 AND kost_type_id = $3
         FOR SHARE`,
        [dto.version_id, dto.property_id, kostTypeId],
      );
      const version = historical.rows[0];
      if (!version) {
        throw new NotFoundException({
          code: 'CATEGORY_CONTENT_VERSION_NOT_FOUND',
          message: 'Category content version not found.',
        });
      }
      const payload = this.payloadItems(version.payload, version.content_type as ContentType);
      if (version.content_type === 'facilities') {
        await client.query(
          `UPDATE kost_type_content_facilities
           SET content_state = 'archived', archived_at = now(), public_visible = false,
               updated_by_user_id = $3, updated_at = now()
           WHERE property_id = $1 AND kost_type_id = $2 AND archived_at IS NULL`,
          [dto.property_id, kostTypeId, user.id],
        );
        for (const [index, item] of payload.entries()) {
          await client.query(
            `INSERT INTO kost_type_content_facilities (
               property_id, kost_type_id, label, normalized_label, public_description,
               sort_order, content_state, public_visible, created_by_user_id, updated_by_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6,'active',true,$7,$7)`,
            [
              dto.property_id,
              kostTypeId,
              String(item.label),
              this.normalizeLabel(String(item.label)),
              item.public_description ?? null,
              index,
              user.id,
            ],
          );
        }
      } else {
        await client.query(
          `UPDATE hunian_gallery_images
           SET content_state = 'archived', archived_at = now(), archived_by_user_id = $3,
               is_cover = false, public_visible = false, updated_by = $3, updated_at = now()
           WHERE property_id = $1 AND kost_type_id = $2
             AND target_type = 'kost_type' AND deleted_at IS NULL`,
          [dto.property_id, kostTypeId, user.id],
        );
        for (const [index, item] of payload.entries()) {
          await client.query(
            `INSERT INTO hunian_gallery_images (
               property_id, target_type, kost_type_id, file_id, public_derivative_file_id,
               alt_text, caption, sort_order, is_cover, public_visible, content_state,
               created_by, updated_by
             ) VALUES ($1,'kost_type',$2,$3,$4,$5,$6,$7,$8,false,'draft',$9,$9)`,
            [
              dto.property_id,
              kostTypeId,
              item.source_file_id,
              item.public_derivative_file_id,
              item.alt_text,
              item.caption ?? null,
              index,
              item.is_cover === true,
              user.id,
            ],
          );
        }
      }
      const response = await this.categoryWorkspaceWithClient(
        client,
        dto.property_id,
        kostTypeId,
        type,
      );
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'kost_type_content.restore_as_draft',
          resourceType: 'kost_type_content_version',
          resourceId: dto.version_id,
          afterData: {
            category: type.category,
            content_type: version.content_type,
            restored_as_draft: true,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, dto.version_id, 200);
      return response;
    });
  }

  async policyWorkspace(user: UserAccessContext, propertyId: string) {
    await this.properties.assertCanReadProperty(user, propertyId);
    await this.assertExactlyTwoCategories(propertyId);
    return v2Data(await this.policyWorkspaceRows(this.database.client, propertyId));
  }

  async savePolicyDraft(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(SavePropertyPolicyDraftDto, body);
    await this.assertCanMutate(user, dto.property_id);
    this.assertPublicTerms(dto.public_content);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      await this.lockCategoryAuthority(client, dto.property_id);
      const route = '/property-policy-documents/draft';
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const draft = await client.query<Row>(
        `INSERT INTO property_policy_documents (
           property_id, document_type, version, publication_status,
           internal_content, public_content, created_by_user_id, updated_by_user_id
         ) VALUES ($1,'public_terms',1,'draft',$2::jsonb,$3::jsonb,$4,$4)
         ON CONFLICT (property_id, document_type) WHERE publication_status = 'draft'
         DO UPDATE SET internal_content = EXCLUDED.internal_content,
                       public_content = EXCLUDED.public_content,
                       updated_by_user_id = EXCLUDED.updated_by_user_id,
                       updated_at = now()
         RETURNING id`,
        [
          dto.property_id,
          JSON.stringify({ operating_policy: dto.internal_operating_policy.trim() }),
          JSON.stringify(this.publicTerms(dto.public_content)),
          user.id,
        ],
      );
      const response = v2Data(await this.policyWorkspaceRows(client, dto.property_id));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'property_policy.draft_save',
          resourceType: 'property_policy_document',
          resourceId: String(draft.rows[0].id),
          afterData: {
            document_type: 'public_terms',
            public_field_count: Object.keys(dto.public_content).length,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, String(draft.rows[0].id), 200);
      return response;
    });
  }

  async publishPolicy(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(PublishPropertyPolicyDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const route = '/property-policy-documents/publish';
      await this.lockProperty(client, dto.property_id);
      await this.lockCategoryAuthority(client, dto.property_id);
      await this.assertEffectiveDate(client, dto.effective_date);
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const draft = await client.query<Row>(
        `SELECT id, internal_content, public_content
         FROM property_policy_documents
         WHERE property_id = $1 AND document_type = 'public_terms'
           AND publication_status = 'draft'
         FOR UPDATE`,
        [dto.property_id],
      );
      if (!draft.rows[0]) {
        throw new ConflictException({
          code: 'PROPERTY_POLICY_DRAFT_REQUIRED',
          message: 'Save a policy draft before publishing.',
        });
      }
      this.assertPublicTerms(draft.rows[0].public_content);
      const future = await client.query(
        `SELECT id FROM property_policy_documents
         WHERE property_id = $1 AND document_type = 'public_terms'
           AND publication_status = 'published'
           AND effective_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         FOR UPDATE`,
        [dto.property_id],
      );
      if (future.rows.length) {
        throw new ConflictException({
          code: 'PROPERTY_POLICY_FUTURE_CONFLICT',
          message: 'A future policy publication is already scheduled.',
        });
      }
      const versionResult = await client.query<{ version: number }>(
        `SELECT COALESCE(MAX(version), 1)::int + 1 AS version
         FROM property_policy_documents
         WHERE property_id = $1 AND document_type = 'public_terms'`,
        [dto.property_id],
      );
      const version = Number(versionResult.rows[0]?.version ?? 2);
      const inserted = await client.query<Row>(
        `INSERT INTO property_policy_documents (
           property_id, document_type, version, publication_status, effective_date,
           internal_content, public_content, published_at, published_by_user_id,
           created_by_user_id, updated_by_user_id
         ) VALUES ($1,'public_terms',$2,'published',$3,$4::jsonb,$5::jsonb,now(),$6,$6,$6)
         RETURNING id`,
        [
          dto.property_id,
          version,
          dto.effective_date.slice(0, 10),
          JSON.stringify(draft.rows[0].internal_content),
          JSON.stringify(draft.rows[0].public_content),
          user.id,
        ],
      );
      const response = v2Data(await this.policyWorkspaceRows(client, dto.property_id));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'property_policy.publish',
          resourceType: 'property_policy_document',
          resourceId: String(inserted.rows[0].id),
          afterData: {
            document_type: 'public_terms',
            version,
            effective_date: dto.effective_date.slice(0, 10),
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, String(inserted.rows[0].id), 201);
      return response;
    });
  }

  async unpublishPolicy(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(UnpublishPropertyPolicyDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      await this.lockCategoryAuthority(client, dto.property_id);
      const route = '/property-policy-documents/unpublish';
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const archived = await client.query<Row>(
        `UPDATE property_policy_documents
         SET publication_status = 'archived', archived_at = now(), updated_at = now()
         WHERE property_id = $1 AND document_type = 'public_terms'
           AND publication_status = 'published'
         RETURNING id`,
        [dto.property_id],
      );
      if (!archived.rows.length) {
        throw new ConflictException({
          code: 'PROPERTY_POLICY_NOT_PUBLISHED',
          message: 'No published public terms are available to unpublish.',
        });
      }
      const response = v2Data(await this.policyWorkspaceRows(client, dto.property_id));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'property_policy.unpublish',
          resourceType: 'property_policy_document',
          afterData: { archived_version_count: archived.rows.length },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, dto.property_id, 200);
      return response;
    });
  }

  async restorePolicy(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(RestorePropertyPolicyDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      await this.lockProperty(client, dto.property_id);
      await this.lockCategoryAuthority(client, dto.property_id);
      const route = '/property-policy-documents/restore';
      const replay = await this.claim(
        client,
        dto.property_id,
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const historical = await client.query<Row>(
        `SELECT id, internal_content, public_content
         FROM property_policy_documents
         WHERE id = $1 AND property_id = $2
           AND publication_status IN ('published', 'archived')
         FOR SHARE`,
        [dto.version_id, dto.property_id],
      );
      if (!historical.rows[0]) {
        throw new NotFoundException({
          code: 'PROPERTY_POLICY_VERSION_NOT_FOUND',
          message: 'Published policy version not found.',
        });
      }
      this.assertPublicTerms(historical.rows[0].public_content);
      const restored = await client.query(
        `UPDATE property_policy_documents
         SET internal_content = $2::jsonb, public_content = $3::jsonb,
             restored_from_version_id = $4, updated_by_user_id = $5, updated_at = now()
         WHERE property_id = $1 AND document_type = 'public_terms'
           AND publication_status = 'draft'
         RETURNING id`,
        [
          dto.property_id,
          JSON.stringify(historical.rows[0].internal_content),
          JSON.stringify(historical.rows[0].public_content),
          dto.version_id,
          user.id,
        ],
      );
      if (!restored.rows[0]) {
        throw new ConflictException({
          code: 'PROPERTY_POLICY_DRAFT_REQUIRED',
          message: 'A policy draft is required before restoring a published version.',
        });
      }
      const response = v2Data(await this.policyWorkspaceRows(client, dto.property_id));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'property_policy.restore_as_draft',
          resourceType: 'property_policy_document',
          resourceId: dto.version_id,
          afterData: { document_type: 'public_terms', restored_as_draft: true },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, dto.version_id, 200);
      return response;
    });
  }

  async publicProjection(propertyId: string, category: Category) {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return this.publicProjectionWithinSnapshot(client, propertyId, category);
    });
  }

  async publicProjectionBatchWithinSnapshot(
    client: PoolClient,
    targets: Array<{ propertyId: string; category: Category }>,
  ) {
    const targetKeys = targets.map((target) => `${target.propertyId}:${target.category}`);
    if (targets.length > 2 || new Set(targetKeys).size !== targets.length) {
      throw new ConflictException({
        code: 'PUBLIC_CATEGORY_CONTENT_AUTHORITY_AMBIGUOUS',
        message: 'Published category content requires reconciliation.',
      });
    }
    return Promise.all(
      targets.map((target) =>
        this.publicProjectionWithinSnapshot(client, target.propertyId, target.category),
      ),
    );
  }

  private async publicProjectionWithinSnapshot(
    client: PoolClient,
    propertyId: string,
    category: Category,
  ) {
    const type = await client.query<Row>(
      `SELECT id, category, name
       FROM kost_types
       WHERE property_id = $1 AND category = $2 AND status = 'active' AND deleted_at IS NULL`,
      [propertyId, category],
    );
    if (type.rows.length !== 1) {
      throw new NotFoundException({
        code: 'PUBLIC_CATEGORY_CONTENT_NOT_FOUND',
        message: 'Published category content is not available.',
      });
    }
    const kostTypeId = String(type.rows[0].id);
    const [facilities, gallery, terms] = await Promise.all([
      this.currentPublished(client, propertyId, kostTypeId, 'facilities'),
      this.currentPublished(client, propertyId, kostTypeId, 'gallery'),
      client.query<Row>(
        `SELECT version, effective_date, public_content, published_at
         FROM property_policy_documents
         WHERE property_id = $1 AND document_type = 'public_terms'
           AND publication_status = 'published'
           AND effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
         ORDER BY effective_date DESC, version DESC
         LIMIT 2`,
        [propertyId],
      ),
    ]);
    if (terms.rows.length > 1 && this.sameDate(terms.rows[0], terms.rows[1])) {
      throw new ConflictException({
        code: 'PUBLIC_POLICY_AUTHORITY_AMBIGUOUS',
        message: 'Published policy authority requires reconciliation.',
      });
    }
    const publicTerms = terms.rows[0]
      ? this.publicTermsProjection(terms.rows[0].public_content, category)
      : null;
    return v2Data({
      category,
      category_label: CATEGORY_LABEL[category],
      facilities: facilities?.items ?? [],
      gallery: (gallery?.items ?? []).map((item: Row) => ({
        content_url: `/api/v1/public/hunian-gallery/${String(item.id)}/content`,
        alt_text: item.alt_text,
        caption: item.caption ?? null,
        sort_order: item.sort_order,
        is_cover: item.is_cover,
      })),
      terms: publicTerms,
      publication: {
        facilities_version: facilities?.version ?? null,
        gallery_version: gallery?.version ?? null,
        terms_version: publicTerms ? (terms.rows[0]?.version ?? null) : null,
      },
    });
  }

  private async categoryWorkspaceWithClient(
    client: PoolClient,
    propertyId: string,
    kostTypeId: string,
    type: { category: Category },
  ) {
    const [facilities, gallery, versions] = await Promise.all([
      client.query<Row>(
        `SELECT id, label, normalized_label, public_description, sort_order, content_state,
                public_visible, created_at, updated_at
         FROM kost_type_content_facilities
         WHERE property_id = $1 AND kost_type_id = $2
         ORDER BY content_state, sort_order, normalized_label, id`,
        [propertyId, kostTypeId],
      ),
      client.query<Row>(
        `SELECT id, file_id, public_derivative_file_id, alt_text, caption, sort_order,
                is_cover, content_state, created_at, updated_at
         FROM hunian_gallery_images
         WHERE property_id = $1 AND kost_type_id = $2
           AND target_type = 'kost_type' AND deleted_at IS NULL
         ORDER BY content_state, is_cover DESC, sort_order, id`,
        [propertyId, kostTypeId],
      ),
      client.query<Row>(
        `SELECT id, content_type, version, publication_status, effective_date,
                restored_from_version_id, published_at, published_by_user_id, created_at
         FROM kost_type_content_versions
         WHERE property_id = $1 AND kost_type_id = $2
         ORDER BY content_type, version DESC`,
        [propertyId, kostTypeId],
      ),
    ]);
    return v2Data({
      property_id: propertyId,
      kost_type_id: kostTypeId,
      category: { category: type.category, label: CATEGORY_LABEL[type.category] },
      facilities: facilities.rows.map((row) => this.facilityResponse(row)),
      gallery: gallery.rows.map((row) => this.galleryResponse(row)),
      publication: this.publicationState(versions.rows),
    });
  }

  private async policyWorkspaceRows(client: { query: PoolClient['query'] }, propertyId: string) {
    const result = await client.query<Row>(
      `SELECT id, version, publication_status, effective_date, internal_content,
              public_content, restored_from_version_id, published_at,
              published_by_user_id, created_at, updated_at
       FROM property_policy_documents
       WHERE property_id = $1 AND document_type = 'public_terms'
       ORDER BY CASE publication_status WHEN 'draft' THEN 0 ELSE 1 END, version DESC`,
      [propertyId],
    );
    const draft = result.rows.find((row) => row.publication_status === 'draft');
    return {
      property_id: propertyId,
      draft: draft
        ? {
            id: draft.id,
            internal_operating_policy:
              (draft.internal_content as Row | undefined)?.operating_policy ?? '',
            public_content: draft.public_content,
            restored_from_version_id: draft.restored_from_version_id ?? null,
            updated_at: this.iso(draft.updated_at),
          }
        : null,
      versions: result.rows
        .filter((row) => row.publication_status !== 'draft')
        .map((row) => this.policyVersionResponse(row)),
    };
  }

  private async facilitySnapshot(client: PoolClient, propertyId: string, kostTypeId: string) {
    const result = await client.query<Row>(
      `SELECT label, public_description, sort_order
       FROM kost_type_content_facilities
       WHERE property_id = $1 AND kost_type_id = $2
         AND content_state = 'active' AND archived_at IS NULL AND public_visible = true
       ORDER BY sort_order, normalized_label, id
       FOR SHARE`,
      [propertyId, kostTypeId],
    );
    return {
      items: result.rows.map((row, index) => ({
        label: row.label,
        public_description: row.public_description ?? null,
        sort_order: index,
      })),
    };
  }

  private async gallerySnapshot(client: PoolClient, propertyId: string, kostTypeId: string) {
    const result = await client.query<Row>(
      `SELECT image.id, image.file_id, image.public_derivative_file_id, image.alt_text,
              image.caption, image.sort_order, image.is_cover,
              source.metadata AS source_metadata, derivative.metadata AS derivative_metadata,
              derivative.property_id AS derivative_property_id,
              derivative.file_purpose AS derivative_purpose,
              derivative.is_deleted AS derivative_deleted
       FROM hunian_gallery_images image
       JOIN files source ON source.id = image.file_id
       LEFT JOIN files derivative ON derivative.id = image.public_derivative_file_id
       WHERE image.property_id = $1 AND image.kost_type_id = $2
         AND image.target_type = 'kost_type' AND image.content_state = 'draft'
         AND image.deleted_at IS NULL
       ORDER BY image.is_cover DESC, image.sort_order, image.id
       FOR UPDATE OF image`,
      [propertyId, kostTypeId],
    );
    if (result.rows.length && result.rows.filter((row) => row.is_cover === true).length !== 1) {
      throw new ConflictException({
        code: 'GALLERY_COVER_AUTHORITY_INVALID',
        message: 'Published gallery requires exactly one cover image.',
      });
    }
    for (const row of result.rows) this.assertDerivative(row, propertyId);
    return {
      items: result.rows.map((row, index) => ({
        id: row.id,
        source_file_id: row.file_id,
        public_derivative_file_id: row.public_derivative_file_id,
        alt_text: row.alt_text,
        caption: row.caption ?? null,
        sort_order: index,
        is_cover: row.is_cover === true,
      })),
    };
  }

  private async currentPublished(
    client: { query: PoolClient['query'] },
    propertyId: string,
    kostTypeId: string,
    contentType: ContentType,
  ): Promise<(Row & { items: Row[] }) | null> {
    const result = await client.query<Row>(
      `SELECT version, effective_date, payload
       FROM kost_type_content_versions
       WHERE property_id = $1 AND kost_type_id = $2 AND content_type = $3
         AND publication_status = 'published'
         AND effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
       ORDER BY effective_date DESC, version DESC
       LIMIT 2`,
      [propertyId, kostTypeId, contentType],
    );
    if (result.rows.length > 1 && this.sameDate(result.rows[0], result.rows[1])) {
      throw new ConflictException({
        code: 'CATEGORY_CONTENT_AUTHORITY_AMBIGUOUS',
        message: 'Published category content requires reconciliation.',
      });
    }
    const row = result.rows[0];
    return row ? { ...row, items: this.payloadItems(row.payload, contentType) } : null;
  }

  private async assertNoFuturePublication(
    client: PoolClient,
    propertyId: string,
    kostTypeId: string,
    contentType: ContentType,
  ) {
    const result = await client.query(
      `SELECT id FROM kost_type_content_versions
       WHERE property_id = $1 AND kost_type_id = $2 AND content_type = $3
         AND publication_status = 'published'
         AND effective_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
       FOR UPDATE`,
      [propertyId, kostTypeId, contentType],
    );
    if (result.rows.length) {
      throw new ConflictException({
        code: 'CATEGORY_CONTENT_FUTURE_CONFLICT',
        message: 'A future category publication is already scheduled.',
      });
    }
  }

  private async assertNoPublicationAtEffectiveDate(
    client: PoolClient,
    propertyId: string,
    kostTypeId: string,
    contentType: ContentType,
    effectiveDate: string,
  ) {
    const result = await client.query(
      `SELECT id FROM kost_type_content_versions
       WHERE property_id = $1 AND kost_type_id = $2 AND content_type = $3
         AND publication_status = 'published' AND effective_date = $4::date
       FOR UPDATE`,
      [propertyId, kostTypeId, contentType, effectiveDate.slice(0, 10)],
    );
    if (result.rows.length) {
      throw new ConflictException({
        code: 'CATEGORY_CONTENT_EFFECTIVE_DATE_CONFLICT',
        message: 'Category content is already published for this effective date.',
      });
    }
  }

  private async lockCategory(client: PoolClient, propertyId: string, kostTypeId: string) {
    const rows = await this.lockCategoryAuthority(client, propertyId);
    const category = rows.find((row) => row.id === kostTypeId);
    if (!category) {
      throw new NotFoundException({
        code: 'KOST_TYPE_NOT_FOUND',
        message: 'Kost type not found.',
      });
    }
    return category;
  }

  private async lockCategoryAuthority(client: PoolClient, propertyId: string) {
    const result = await client.query<{ id: string; category: Category }>(
      `SELECT id, category
       FROM kost_types
       WHERE property_id = $1 AND status = 'active' AND deleted_at IS NULL
       ORDER BY category, id
       FOR UPDATE`,
      [propertyId],
    );
    if (
      result.rows.length !== 2 ||
      result.rows[0]?.category !== 'apartkost' ||
      result.rows[1]?.category !== 'rukost'
    ) {
      throw new ConflictException({
        code: 'CATEGORY_CONTENT_RECONCILIATION_REQUIRED',
        message: 'Category content requires exactly Rumah Kost and Apart Kost.',
      });
    }
    return result.rows;
  }

  private async requireCategory(propertyId: string, kostTypeId: string) {
    const result = await this.database.client.query<{ category: Category }>(
      `SELECT category FROM kost_types
       WHERE id = $1 AND property_id = $2 AND status = 'active' AND deleted_at IS NULL`,
      [kostTypeId, propertyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'KOST_TYPE_NOT_FOUND',
        message: 'Kost type not found.',
      });
    }
    return result.rows[0];
  }

  private async assertExactlyTwoCategories(propertyId: string) {
    const result = await this.database.client.query<{ category: Category }>(
      `SELECT category FROM kost_types
       WHERE property_id = $1 AND status = 'active' AND deleted_at IS NULL
       ORDER BY category`,
      [propertyId],
    );
    if (
      result.rows.length !== 2 ||
      result.rows[0]?.category !== 'apartkost' ||
      result.rows[1]?.category !== 'rukost'
    ) {
      throw new ConflictException({
        code: 'CATEGORY_CONTENT_RECONCILIATION_REQUIRED',
        message: 'Category content requires exactly Rumah Kost and Apart Kost.',
      });
    }
  }

  private async lockProperty(client: PoolClient, propertyId: string) {
    const result = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [propertyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'PROPERTY_NOT_FOUND',
        message: 'Property not found.',
      });
    }
  }

  private async assertCanMutate(user: UserAccessContext, propertyId: string) {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate category content.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private assertDerivative(row: Row, propertyId: string) {
    if (
      !row.public_derivative_file_id ||
      row.public_derivative_file_id === row.file_id ||
      row.derivative_property_id !== propertyId ||
      row.derivative_purpose !== 'hunian_gallery' ||
      row.derivative_deleted === true
    ) {
      throw new UnprocessableEntityException({
        code: 'GALLERY_PUBLIC_DERIVATIVE_INVALID',
        message: 'Every published image requires a separate public-safe derivative.',
      });
    }
    const metadata = (row.derivative_metadata ?? {}) as Row;
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width > PUBLIC_IMAGE_MAX_DIMENSION ||
      height > PUBLIC_IMAGE_MAX_DIMENSION ||
      metadata.public_safe_derivative !== true
    ) {
      throw new UnprocessableEntityException({
        code: 'GALLERY_PUBLIC_DERIVATIVE_DIMENSIONS_INVALID',
        message: 'Public gallery derivative dimensions are invalid.',
      });
    }
  }

  private assertPublicTerms(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({
        code: 'PUBLIC_TERMS_INVALID',
        message: 'Public terms are invalid.',
      });
    }
    const content = value as Row;
    const expected = [
      'pricing_explanation',
      'minimum_lease_term',
      'dp_explanation',
      'security_deposit_explanation',
      'manual_payment_methods',
      'house_rules',
      'visitor_hours',
      'contact_information',
      'category_applicability',
    ];
    const stringFields = [
      'pricing_explanation',
      'minimum_lease_term',
      'dp_explanation',
      'security_deposit_explanation',
      'visitor_hours',
      'contact_information',
    ];
    const manualMethods = content.manual_payment_methods;
    const houseRules = content.house_rules;
    const categories = content.category_applicability;
    if (
      Object.keys(content).sort().join('|') !== expected.sort().join('|') ||
      stringFields.some(
        (field) => typeof content[field] !== 'string' || !String(content[field]).trim(),
      ) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(content.visitor_hours)) ||
      !Array.isArray(manualMethods) ||
      manualMethods.length === 0 ||
      manualMethods.some((item) => typeof item !== 'string' || !item.trim()) ||
      !Array.isArray(houseRules) ||
      houseRules.some((item) => typeof item !== 'string' || !item.trim()) ||
      !Array.isArray(categories) ||
      categories.length === 0 ||
      new Set(categories).size !== categories.length ||
      categories.some((item) => item !== 'rukost' && item !== 'apartkost')
    ) {
      throw new BadRequestException({
        code: 'PUBLIC_TERMS_INVALID',
        message: 'Public terms must use the exact structured contract.',
      });
    }
  }

  private publicTerms(value: SavePropertyPolicyDraftDto['public_content']) {
    return {
      pricing_explanation: value.pricing_explanation.trim(),
      minimum_lease_term: value.minimum_lease_term.trim(),
      dp_explanation: value.dp_explanation.trim(),
      security_deposit_explanation: value.security_deposit_explanation.trim(),
      manual_payment_methods: value.manual_payment_methods.map((item) => item.trim()),
      house_rules: value.house_rules.map((item) => item.trim()).filter(Boolean),
      visitor_hours: value.visitor_hours,
      contact_information: value.contact_information.trim(),
      category_applicability: [...new Set(value.category_applicability)].sort(),
    };
  }

  private facilityResponse(row: Row) {
    return {
      id: row.id,
      label: row.label,
      normalized_label: row.normalized_label,
      public_description: row.public_description ?? null,
      sort_order: Number(row.sort_order),
      content_state: row.content_state,
      public_visible: row.public_visible,
      created_at: this.iso(row.created_at),
      updated_at: this.iso(row.updated_at),
    };
  }

  private galleryResponse(row: Row) {
    const publicDerivativeFileId =
      typeof row.public_derivative_file_id === 'string' ? row.public_derivative_file_id : null;
    return {
      id: row.id,
      source_file_id: row.file_id,
      public_derivative_file_id: publicDerivativeFileId,
      source_content_url: `/api/v1/files/${String(row.file_id)}/content`,
      public_preview_url: publicDerivativeFileId
        ? `/api/v1/files/${publicDerivativeFileId}/content`
        : null,
      alt_text: row.alt_text,
      caption: row.caption ?? null,
      sort_order: Number(row.sort_order),
      is_cover: row.is_cover,
      content_state: row.content_state,
      created_at: this.iso(row.created_at),
      updated_at: this.iso(row.updated_at),
    };
  }

  private publicationState(rows: Row[]) {
    return {
      facilities: rows
        .filter((row) => row.content_type === 'facilities')
        .map((row) => this.versionResponse(row)),
      gallery: rows
        .filter((row) => row.content_type === 'gallery')
        .map((row) => this.versionResponse(row)),
    };
  }

  private versionResponse(row: Row) {
    return {
      id: row.id,
      content_type: row.content_type,
      version: Number(row.version),
      publication_status: row.publication_status,
      effective_date: this.dateOnly(row.effective_date),
      restored_from_version_id: row.restored_from_version_id ?? null,
      published_at: this.iso(row.published_at),
      published_by_user_id: row.published_by_user_id ?? null,
      created_at: this.iso(row.created_at ?? row.published_at),
    };
  }

  private policyVersionResponse(row: Row) {
    return {
      id: row.id,
      version: Number(row.version),
      publication_status: row.publication_status,
      effective_date: row.effective_date ? this.dateOnly(row.effective_date) : null,
      public_content: row.public_content,
      restored_from_version_id: row.restored_from_version_id ?? null,
      published_at: this.iso(row.published_at),
      published_by_user_id: row.published_by_user_id ?? null,
      created_at: this.iso(row.created_at),
    };
  }

  private payloadItems(payload: unknown, contentType: ContentType): Row[] {
    if (
      !this.isRecord(payload) ||
      !this.hasExactKeys(payload, ['items']) ||
      !Array.isArray(payload.items)
    ) {
      this.invalidPublishedPayload();
    }
    const expected =
      contentType === 'facilities'
        ? ['label', 'public_description', 'sort_order']
        : [
            'id',
            'source_file_id',
            'public_derivative_file_id',
            'alt_text',
            'caption',
            'sort_order',
            'is_cover',
          ];
    const items = payload.items as unknown[];
    for (const item of items) {
      if (!this.isRecord(item) || !this.hasExactKeys(item, expected))
        this.invalidPublishedPayload();
      if (!Number.isSafeInteger(item.sort_order) || Number(item.sort_order) < 0) {
        this.invalidPublishedPayload();
      }
      if (contentType === 'facilities') {
        if (
          typeof item.label !== 'string' ||
          item.label.trim().length === 0 ||
          (item.public_description !== null && typeof item.public_description !== 'string')
        ) {
          this.invalidPublishedPayload();
        }
      } else if (
        !this.isUuid(item.id) ||
        !this.isUuid(item.source_file_id) ||
        !this.isUuid(item.public_derivative_file_id) ||
        typeof item.alt_text !== 'string' ||
        item.alt_text.trim().length === 0 ||
        (item.caption !== null && typeof item.caption !== 'string') ||
        typeof item.is_cover !== 'boolean'
      ) {
        this.invalidPublishedPayload();
      }
    }
    return items as Row[];
  }

  private publicTermsProjection(value: unknown, category: Category) {
    try {
      this.assertPublicTerms(value);
    } catch {
      this.invalidPublishedPayload();
    }
    const applicability = (value as Row).category_applicability as string[];
    return applicability.includes(category) ? this.publicTerms(value as never) : null;
  }

  private async assertEffectiveDate(client: PoolClient, value: string) {
    const result = await client.query<{ business_date: string }>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date::text AS business_date`,
    );
    if (value.slice(0, 10) < String(result.rows[0]?.business_date)) {
      throw new UnprocessableEntityException({
        code: 'PUBLICATION_EFFECTIVE_DATE_PAST',
        message: 'Publication effective date cannot be before the Jakarta business date.',
      });
    }
  }

  private isRecord(value: unknown): value is Row {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private hasExactKeys(value: Row, keys: string[]) {
    return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
  }

  private isUuid(value: unknown) {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
  }

  private invalidPublishedPayload(): never {
    throw new ConflictException({
      code: 'PUBLISHED_CONTENT_PAYLOAD_INVALID',
      message: 'Published content requires reconciliation before it can be displayed.',
    });
  }

  private sameDate(left: Row, right: Row) {
    return String(left.effective_date).slice(0, 10) === String(right.effective_date).slice(0, 10);
  }

  private normalizeLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  }

  private requireKey(value?: string) {
    const key = value?.trim();
    if (!key || key.length > 200) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required.',
      });
    }
    return key;
  }

  private fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async validate<T extends object>(type: DtoClass<T>, body: unknown): Promise<T> {
    return (await this.strictValidation.transform(body, {
      type: 'body',
      metatype: type,
    })) as T;
  }

  private async claim(
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
        message: 'The content command is still being processed.',
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
        message: 'The previous content command response is unavailable.',
      });
    }
    return command.response_body;
  }

  private async complete(
    client: PoolClient,
    actorUserId: string,
    route: string,
    key: string,
    body: unknown,
    resourceId: string,
    status: 200 | 201,
  ) {
    await client.query(
      `UPDATE idempotency_commands
       SET command_status = 'succeeded', response_status = $6, response_body = $4::jsonb,
           resource_type = 'category_content', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorUserId, route, key, JSON.stringify(body), resourceId, status],
    );
  }

  private iso(value: unknown) {
    return value instanceof Date
      ? value.toISOString()
      : typeof value === 'string'
        ? new Date(value).toISOString()
        : null;
  }

  private dateOnly(value: unknown) {
    const iso = this.iso(value);
    if (!iso) {
      throw new UnprocessableEntityException({
        code: 'CATEGORY_CONTENT_DATE_INVALID',
        message: 'Category content date is invalid.',
      });
    }
    return iso.slice(0, 10);
  }
}
