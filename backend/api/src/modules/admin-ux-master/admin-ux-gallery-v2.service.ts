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
import { normalizePagination, v2Data, v2List } from '../../shared/admin-ux-v2';
import type { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  CreateHunianGalleryV2Dto,
  HunianGalleryMutationScopeDto,
  ListHunianGalleryV2QueryDto,
  ReorderHunianGalleryV2Dto,
  UpdateHunianGalleryV2Dto,
} from './admin-ux-gallery-v2.dto';

type Row = Record<string, unknown>;
type DtoClass<T extends object> = new () => T;
type IdempotencyRow = {
  request_fingerprint: string;
  command_status: string;
  response_body: unknown;
};

const MAX_PUBLIC_DIMENSION = 1920;

@Injectable()
export class AdminUxGalleryV2Service {
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

  async list(user: UserAccessContext, body: unknown) {
    const query = await this.validate(ListHunianGalleryV2QueryDto, body);
    const scope = await this.scope(user, query.property_id);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<Row>(
      `SELECT image.id, image.property_id, image.target_type, image.kost_type_id,
              image.file_id, image.public_derivative_file_id, image.alt_text, image.caption,
              image.sort_order, image.is_cover, image.content_state,
              image.created_at, image.updated_at, kost_type.name AS kost_type_name,
              COUNT(*) OVER()::int AS total
       FROM hunian_gallery_images image
       JOIN kost_types kost_type ON kost_type.id = image.kost_type_id
       WHERE image.deleted_at IS NULL
         AND image.target_type = 'kost_type'
         AND ($1::uuid[] IS NULL OR image.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR image.property_id = $2)
         AND ($3::uuid IS NULL OR image.kost_type_id = $3)
       ORDER BY image.property_id, image.kost_type_id, image.content_state,
                image.is_cover DESC, image.sort_order, image.created_at, image.id
       LIMIT $4 OFFSET $5`,
      [scope, query.property_id ?? null, query.kost_type_id ?? null, limit, offset],
    );
    return v2List(
      result.rows.map((row) => this.response(row)),
      limit,
      offset,
      Number(result.rows[0]?.total ?? 0),
    );
  }

  async create(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(CreateHunianGalleryV2Dto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      await this.lockTarget(client, dto.property_id, dto.kost_type_id);
      await this.assertFilePair(
        client,
        dto.property_id,
        dto.file_id,
        dto.public_derivative_file_id,
      );
      const route = '/hunian-gallery';
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
      const count = await client.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(sort_order), -1)::int + 1 AS next_order
         FROM hunian_gallery_images
         WHERE property_id = $1 AND kost_type_id = $2 AND target_type = 'kost_type'
           AND deleted_at IS NULL AND content_state = 'draft'`,
        [dto.property_id, dto.kost_type_id],
      );
      const result = await client.query<Row>(
        `INSERT INTO hunian_gallery_images (
           property_id, target_type, kost_type_id, file_id, public_derivative_file_id,
           alt_text, caption, sort_order, is_cover, public_visible, content_state,
           created_by, updated_by
         ) VALUES ($1,'kost_type',$2,$3,$4,$5,$6,$7,false,false,'draft',$8,$8)
         RETURNING *`,
        [
          dto.property_id,
          dto.kost_type_id,
          dto.file_id,
          dto.public_derivative_file_id,
          dto.alt_text.trim(),
          dto.caption?.trim() || null,
          Number(count.rows[0]?.next_order ?? 0),
          user.id,
        ],
      );
      const response = v2Data(this.response(result.rows[0]));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'hunian_gallery.attach.v2',
          resourceType: 'hunian_gallery_image',
          resourceId: String(result.rows[0].id),
          afterData: this.auditPayload(result.rows[0]),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, String(result.rows[0].id), 201);
      return response;
    });
  }

  async update(
    user: UserAccessContext,
    imageId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(UpdateHunianGalleryV2Dto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const before = await this.lockDraftImageSet(client, imageId, dto.property_id);
      const route = `/hunian-gallery/${imageId}`;
      const replay = await this.claim(
        client,
        String(before.property_id),
        user.id,
        route,
        key,
        this.fingerprint(dto),
        context.correlationId,
      );
      if (replay) return replay;
      const result = await client.query<Row>(
        `UPDATE hunian_gallery_images
         SET alt_text = COALESCE($2, alt_text),
             caption = CASE WHEN $3::boolean THEN $4 ELSE caption END,
             updated_by = $5, updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL AND target_type = 'kost_type'
           AND content_state = 'draft'
         RETURNING *`,
        [
          imageId,
          dto.alt_text?.trim() ?? null,
          Object.prototype.hasOwnProperty.call(dto, 'caption'),
          dto.caption?.trim() || null,
          user.id,
        ],
      );
      if (!result.rows[0]) this.notFound();
      const response = v2Data(this.response(result.rows[0]));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: String(before.property_id),
          action: 'hunian_gallery.update.v2',
          resourceType: 'hunian_gallery_image',
          resourceId: imageId,
          beforeData: this.auditPayload(before),
          afterData: this.auditPayload(result.rows[0]),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, imageId, 200);
      return response;
    });
  }

  async setCover(
    user: UserAccessContext,
    imageId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(HunianGalleryMutationScopeDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const current = await this.lockDraftImageSet(client, imageId, dto.property_id);
      const route = `/hunian-gallery/${imageId}/cover`;
      const replay = await this.claim(
        client,
        String(current.property_id),
        user.id,
        route,
        key,
        this.fingerprint({ image_id: imageId }),
        context.correlationId,
      );
      if (replay) return replay;
      await client.query(
        `UPDATE hunian_gallery_images
         SET is_cover = false, updated_by = $3, updated_at = now()
         WHERE property_id = $1 AND kost_type_id = $2 AND target_type = 'kost_type'
           AND content_state = 'draft' AND deleted_at IS NULL`,
        [current.property_id, current.kost_type_id, user.id],
      );
      const result = await client.query<Row>(
        `UPDATE hunian_gallery_images
         SET is_cover = true, updated_by = $2, updated_at = now()
         WHERE id = $1 AND content_state = 'draft' AND deleted_at IS NULL
         RETURNING *`,
        [imageId, user.id],
      );
      const response = v2Data(this.response(result.rows[0]));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: String(current.property_id),
          action: 'hunian_gallery.set_cover.v2',
          resourceType: 'hunian_gallery_image',
          resourceId: imageId,
          afterData: this.auditPayload(result.rows[0]),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, imageId, 200);
      return response;
    });
  }

  async reorder(
    user: UserAccessContext,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(ReorderHunianGalleryV2Dto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: 'REORDER_DUPLICATE_ITEM',
        message: 'Gallery reorder ids must be unique.',
      });
    }
    return this.database.transaction(async (client) => {
      await this.lockTarget(client, dto.property_id, dto.kost_type_id);
      const route = '/hunian-gallery/reorder';
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
      const current = await client.query<Row>(
        `SELECT id FROM hunian_gallery_images
         WHERE property_id = $1 AND kost_type_id = $2 AND target_type = 'kost_type'
           AND content_state = 'draft' AND deleted_at IS NULL
         ORDER BY id FOR UPDATE`,
        [dto.property_id, dto.kost_type_id],
      );
      if (
        current.rows.length !== ids.length ||
        current.rows.some((row) => !ids.includes(String(row.id)))
      ) {
        throw new ConflictException({
          code: 'REORDER_TARGET_INCOMPLETE',
          message: 'Reorder must contain every active draft image in the category.',
        });
      }
      await client.query(
        `UPDATE hunian_gallery_images
         SET sort_order = sort_order + 1000000, updated_by = $3, updated_at = now()
         WHERE property_id = $1 AND kost_type_id = $2 AND target_type = 'kost_type'
           AND content_state = 'draft' AND deleted_at IS NULL`,
        [dto.property_id, dto.kost_type_id, user.id],
      );
      for (const [index, item] of dto.items.entries()) {
        await client.query(
          `UPDATE hunian_gallery_images
           SET sort_order = $2, updated_by = $3, updated_at = now()
           WHERE id = $1 AND content_state = 'draft' AND deleted_at IS NULL`,
          [item.id, index, user.id],
        );
      }
      const result = await client.query<Row>(
        `SELECT * FROM hunian_gallery_images
         WHERE id = ANY($1::uuid[])
         ORDER BY sort_order, id`,
        [ids],
      );
      const response = v2Data(result.rows.map((row) => this.response(row)));
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: dto.property_id,
          action: 'hunian_gallery.reorder.v2',
          resourceType: 'hunian_gallery_image',
          afterData: {
            kost_type_id: dto.kost_type_id,
            item_ids: ids,
          },
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, dto.kost_type_id, 200);
      return response;
    });
  }

  async remove(
    user: UserAccessContext,
    imageId: string,
    body: unknown,
    context: RequestAuditContext,
    idempotencyKey?: string,
  ) {
    const dto = await this.validate(HunianGalleryMutationScopeDto, body);
    await this.assertCanMutate(user, dto.property_id);
    const key = this.requireKey(idempotencyKey);
    return this.database.transaction(async (client) => {
      const before = await this.lockDraftImageSet(client, imageId, dto.property_id);
      const route = `/hunian-gallery/${imageId}/archive`;
      const replay = await this.claim(
        client,
        String(before.property_id),
        user.id,
        route,
        key,
        this.fingerprint({ image_id: imageId }),
        context.correlationId,
      );
      if (replay) return replay;
      const result = await client.query<Row>(
        `UPDATE hunian_gallery_images
         SET content_state = 'archived', archived_at = now(), archived_by_user_id = $2,
             is_cover = false, public_visible = false, updated_by = $2, updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL AND target_type = 'kost_type'
         RETURNING *`,
        [imageId, user.id],
      );
      if (before.is_cover === true) {
        await client.query(
          `UPDATE hunian_gallery_images
           SET is_cover = true, updated_by = $3, updated_at = now()
           WHERE id = (
             SELECT id FROM hunian_gallery_images
             WHERE property_id = $1 AND kost_type_id = $2 AND target_type = 'kost_type'
               AND content_state = 'draft' AND deleted_at IS NULL
             ORDER BY sort_order, id
             LIMIT 1
           )`,
          [before.property_id, before.kost_type_id, user.id],
        );
      }
      const response = v2Data({ id: imageId, archived: true });
      await this.audit.write(
        {
          actorUserId: user.id,
          propertyId: String(before.property_id),
          action: 'hunian_gallery.archive.v2',
          resourceType: 'hunian_gallery_image',
          resourceId: imageId,
          beforeData: this.auditPayload(before),
          afterData: this.auditPayload(result.rows[0]),
          resultStatus: 'success',
          ...context,
        },
        client,
      );
      await this.complete(client, user.id, route, key, response, imageId, 200);
      return response;
    });
  }

  private async assertFilePair(
    client: PoolClient,
    propertyId: string,
    sourceId: string,
    derivativeId: string,
  ) {
    if (sourceId === derivativeId) {
      throw new UnprocessableEntityException({
        code: 'GALLERY_PUBLIC_DERIVATIVE_REQUIRED',
        message: 'Public-safe derivative must be separate from the private source file.',
      });
    }
    const result = await client.query<Row>(
      `SELECT id, metadata
       FROM files
       WHERE id = ANY($1::uuid[]) AND property_id = $2 AND is_deleted = false
         AND file_purpose = 'hunian_gallery'
         AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')
       ORDER BY id
       FOR SHARE`,
      [[sourceId, derivativeId], propertyId],
    );
    if (result.rows.length !== 2) {
      throw new UnprocessableEntityException({
        code: 'HUNIAN_GALLERY_FILE_INVALID',
        message: 'Gallery files must be active images in the same property.',
      });
    }
    const derivative = result.rows.find((row) => row.id === derivativeId);
    const metadata = (derivative?.metadata ?? {}) as Row;
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width > MAX_PUBLIC_DIMENSION ||
      height > MAX_PUBLIC_DIMENSION ||
      metadata.public_safe_derivative !== true
    ) {
      throw new UnprocessableEntityException({
        code: 'GALLERY_PUBLIC_DERIVATIVE_DIMENSIONS_INVALID',
        message: 'Public gallery derivative dimensions are invalid.',
      });
    }
  }

  private async lockTarget(client: PoolClient, propertyId: string, kostTypeId: string) {
    const result = await client.query<{ id: string; category: string }>(
      `SELECT id, category FROM kost_types
       WHERE property_id = $1 AND status = 'active' AND deleted_at IS NULL
       ORDER BY category, id
       FOR UPDATE`,
      [propertyId],
    );
    if (
      result.rows.length !== 2 ||
      result.rows[0]?.category !== 'apartkost' ||
      result.rows[1]?.category !== 'rukost' ||
      !result.rows.some((row) => row.id === kostTypeId)
    ) {
      throw new UnprocessableEntityException({
        code: 'PROPERTY_SCOPE_MISMATCH',
        message: 'Gallery requires the canonical category authority for this property.',
      });
    }
  }

  private async lockDraftImageSet(client: PoolClient, imageId: string, propertyId: string) {
    const scope = await client.query<Row>(
      `SELECT kost_type_id
       FROM hunian_gallery_images
       WHERE id = $1 AND property_id = $2 AND deleted_at IS NULL
         AND target_type = 'kost_type' AND content_state = 'draft'`,
      [imageId, propertyId],
    );
    if (!scope.rows[0]) this.notFound();
    const kostTypeId = String(scope.rows[0].kost_type_id);
    await this.lockTarget(client, propertyId, kostTypeId);
    const locked = await client.query<Row>(
      `SELECT * FROM hunian_gallery_images
       WHERE property_id = $1 AND kost_type_id = $2 AND deleted_at IS NULL
         AND target_type = 'kost_type' AND content_state = 'draft'
       ORDER BY id
       FOR UPDATE`,
      [propertyId, kostTypeId],
    );
    const result = locked.rows.find((row) => row.id === imageId);
    if (!result) this.notFound();
    return result;
  }

  private response(row: Row) {
    const publicDerivativeFileId =
      typeof row.public_derivative_file_id === 'string' ? row.public_derivative_file_id : null;
    return {
      id: row.id,
      property_id: row.property_id,
      target_type: 'kost_type',
      kost_type_id: row.kost_type_id,
      kost_type_name: row.kost_type_name ?? null,
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

  private auditPayload(row: Row) {
    return {
      image_id: row.id,
      property_id: row.property_id,
      kost_type_id: row.kost_type_id,
      source_file_id: row.file_id,
      public_derivative_file_id: row.public_derivative_file_id,
      sort_order: Number(row.sort_order),
      is_cover: row.is_cover,
      content_state: row.content_state,
    };
  }

  private async scope(user: UserAccessContext, propertyId?: string): Promise<string[] | null> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return user.roles.includes('owner') ? null : [propertyId];
    }
    return user.roles.includes('owner') ? null : user.propertyIds;
  }

  private async assertCanMutate(user: UserAccessContext, propertyId: string) {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate gallery data.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async validate<T extends object>(type: DtoClass<T>, body: unknown): Promise<T> {
    return (await this.strictValidation.transform(body, {
      type: 'body',
      metatype: type,
    })) as T;
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
        message: 'The gallery command is still being processed.',
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
        message: 'The previous gallery command response is unavailable.',
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
           resource_type = 'hunian_gallery_image', resource_id = $5, completed_at = now()
       WHERE actor_user_id = $1 AND route = $2 AND idempotency_key = $3`,
      [actorUserId, route, key, JSON.stringify(body), resourceId, status],
    );
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND',
      message: 'Gallery image not found.',
    });
  }

  private iso(value: unknown) {
    return value instanceof Date
      ? value.toISOString()
      : typeof value === 'string'
        ? new Date(value).toISOString()
        : null;
  }
}
