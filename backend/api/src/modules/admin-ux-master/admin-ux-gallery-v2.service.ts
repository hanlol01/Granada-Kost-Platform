import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { normalizePagination, v2Data, v2List } from '../../shared/admin-ux-v2';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import type { RequestAuditContext } from '../property/types/property.types';
import {
  COMMON_AREA_KEYS,
  CreateHunianGalleryV2Dto,
  ListHunianGalleryV2QueryDto,
  ReorderHunianGalleryV2Dto,
  UpdateHunianGalleryV2Dto,
} from './admin-ux-gallery-v2.dto';

type Row = Record<string, unknown>;

@Injectable()
export class AdminUxGalleryV2Service {
  constructor(
    private readonly database: DatabaseService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListHunianGalleryV2QueryDto) {
    const scope = await this.scope(user, query.property_id);
    this.assertTargetQuery(query);
    const { limit, offset } = normalizePagination(query);
    const result = await this.database.client.query<Row>(
      `SELECT image.id, image.property_id, image.target_type, image.kost_type_id, image.common_area_key,
              image.file_id, image.alt_text, image.caption, image.sort_order, image.is_cover,
              image.public_visible, image.created_at, image.updated_at,
              kost_type.name AS kost_type_name, COUNT(*) OVER()::int AS total
       FROM hunian_gallery_images image
       LEFT JOIN kost_types kost_type ON kost_type.id = image.kost_type_id
       WHERE image.deleted_at IS NULL
         AND image.target_type IN ('kost_type', 'common_area')
         AND ($1::uuid[] IS NULL OR image.property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR image.property_id = $2)
         AND ($3::text IS NULL OR image.target_type = $3)
         AND ($4::uuid IS NULL OR image.kost_type_id = $4)
         AND ($5::text IS NULL OR image.common_area_key = $5)
       ORDER BY image.property_id, image.target_type, image.kost_type_id NULLS LAST,
                image.common_area_key NULLS LAST, image.is_cover DESC, image.sort_order, image.created_at
       LIMIT $6 OFFSET $7`,
      [
        scope,
        query.property_id ?? null,
        query.target_type ?? null,
        query.kost_type_id ?? null,
        query.common_area_key ?? null,
        limit,
        offset,
      ],
    );
    return v2List(
      result.rows.map((row) => this.toResponse(row)),
      limit,
      offset,
      Number(result.rows[0]?.total ?? 0),
    );
  }

  async create(
    user: UserAccessContext,
    dto: CreateHunianGalleryV2Dto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    await this.assertTarget(
      dto.property_id,
      dto.target_type,
      dto.kost_type_id,
      dto.common_area_key,
    );
    await this.assertGalleryFile(dto.file_id, dto.property_id);
    const count = await this.countTarget(
      dto.property_id,
      dto.target_type,
      dto.kost_type_id ?? null,
      dto.common_area_key ?? null,
    );
    try {
      const result = await this.database.client.query<Row>(
        `INSERT INTO hunian_gallery_images (
           property_id, target_type, kost_type_id, common_area_key,
           file_id, alt_text, caption, sort_order, public_visible, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, $9), COALESCE($10, false), $11, $11)
         RETURNING *`,
        [
          dto.property_id,
          dto.target_type,
          dto.kost_type_id ?? null,
          dto.common_area_key ?? null,
          dto.file_id,
          dto.alt_text.trim(),
          dto.caption ?? null,
          dto.sort_order ?? null,
          count,
          dto.public_visible ?? null,
          user.id,
        ],
      );
      const record = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: dto.property_id,
        action: 'hunian_gallery.attach.v2',
        resourceType: 'hunian_gallery_image',
        resourceId: String(record.id),
        afterData: this.auditRecord(record),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.toResponse(record));
    } catch (error) {
      if (this.errorCode(error) === '23505') {
        throw new ConflictException({
          code: 'GALLERY_FILE_ALREADY_ATTACHED',
          message: 'File is already attached to this gallery target.',
        });
      }
      throw error;
    }
  }

  async update(
    user: UserAccessContext,
    imageId: string,
    dto: UpdateHunianGalleryV2Dto,
    context: RequestAuditContext,
  ) {
    const before = await this.requireImage(imageId);
    await this.assertCanMutate(user, String(before.property_id));
    const result = await this.database.client.query<Row>(
      `UPDATE hunian_gallery_images
       SET alt_text = COALESCE($2, alt_text),
           caption = CASE WHEN $3::boolean THEN $4 ELSE caption END,
           public_visible = COALESCE($5, public_visible),
           sort_order = COALESCE($6, sort_order),
           updated_by = $7, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        imageId,
        dto.alt_text?.trim() ?? null,
        Object.prototype.hasOwnProperty.call(dto, 'caption'),
        dto.caption ?? null,
        dto.public_visible ?? null,
        dto.sort_order ?? null,
        user.id,
      ],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND',
        message: 'Gallery image not found.',
      });
    const updated = result.rows[0];
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(updated.property_id),
      action: 'hunian_gallery.update.v2',
      resourceType: 'hunian_gallery_image',
      resourceId: imageId,
      beforeData: this.auditRecord(before),
      afterData: this.auditRecord(updated),
      resultStatus: 'success',
      ...context,
    });
    return v2Data(this.toResponse(updated));
  }

  async setCover(user: UserAccessContext, imageId: string, context: RequestAuditContext) {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query<Row>(
        `SELECT * FROM hunian_gallery_images WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [imageId],
      );
      const current = currentResult.rows[0];
      if (!current || !['kost_type', 'common_area'].includes(String(current.target_type))) {
        throw new NotFoundException({
          code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND',
          message: 'Gallery image not found.',
        });
      }
      await this.assertCanMutate(user, String(current.property_id));
      await client.query(
        `UPDATE hunian_gallery_images
         SET is_cover = false, updated_by = $5, updated_at = now()
         WHERE property_id = $1 AND target_type = $2
           AND kost_type_id IS NOT DISTINCT FROM $3::uuid
           AND common_area_key IS NOT DISTINCT FROM $4::text
           AND deleted_at IS NULL`,
        [
          current.property_id,
          current.target_type,
          current.kost_type_id,
          current.common_area_key,
          user.id,
        ],
      );
      const result = await client.query<Row>(
        `UPDATE hunian_gallery_images
         SET is_cover = true, updated_by = $2, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [imageId, user.id],
      );
      await client.query('COMMIT');
      const updated = result.rows[0];
      await this.audit.write({
        actorUserId: user.id,
        propertyId: String(updated.property_id),
        action: 'hunian_gallery.set_cover.v2',
        resourceType: 'hunian_gallery_image',
        resourceId: imageId,
        afterData: this.auditRecord(updated),
        resultStatus: 'success',
        ...context,
      });
      return v2Data(this.toResponse(updated));
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async reorder(
    user: UserAccessContext,
    dto: ReorderHunianGalleryV2Dto,
    context: RequestAuditContext,
  ) {
    await this.assertCanMutate(user, dto.property_id);
    await this.assertTarget(
      dto.property_id,
      dto.target_type,
      dto.kost_type_id,
      dto.common_area_key,
    );
    const ids = [...new Set(dto.items.map((item) => item.id))];
    if (ids.length !== dto.items.length) {
      throw new BadRequestException({
        code: 'REORDER_DUPLICATE_ITEM',
        message: 'Gallery reorder ids must be unique.',
      });
    }
    const current = await this.database.client.query<Row>(
      `SELECT id FROM hunian_gallery_images
       WHERE property_id = $1 AND target_type = $2
         AND kost_type_id IS NOT DISTINCT FROM $3::uuid
         AND common_area_key IS NOT DISTINCT FROM $4::text
         AND deleted_at IS NULL`,
      [dto.property_id, dto.target_type, dto.kost_type_id ?? null, dto.common_area_key ?? null],
    );
    if (
      current.rows.length !== ids.length ||
      current.rows.some((row) => !ids.includes(String(row.id)))
    ) {
      throw new ConflictException({
        code: 'REORDER_TARGET_INCOMPLETE',
        message: 'Reorder must contain every active image in its target.',
      });
    }
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      for (const item of dto.items) {
        await client.query(
          `UPDATE hunian_gallery_images SET sort_order = $2, updated_by = $3, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL`,
          [item.id, item.sort_order, user.id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
    const all = await this.database.client.query<Row>(
      `SELECT * FROM hunian_gallery_images WHERE id = ANY($1::uuid[]) ORDER BY sort_order, id`,
      [ids],
    );
    await this.audit.write({
      actorUserId: user.id,
      propertyId: dto.property_id,
      action: 'hunian_gallery.reorder.v2',
      resourceType: 'hunian_gallery_image',
      afterData: {
        target_type: dto.target_type,
        kost_type_id: dto.kost_type_id ?? null,
        common_area_key: dto.common_area_key ?? null,
        items: dto.items,
      },
      resultStatus: 'success',
      ...context,
    });
    return v2Data(all.rows.map((row) => this.toResponse(row)));
  }

  async remove(user: UserAccessContext, imageId: string, context: RequestAuditContext) {
    const before = await this.requireImage(imageId);
    await this.assertCanMutate(user, String(before.property_id));
    const result = await this.database.client.query<Row>(
      `UPDATE hunian_gallery_images
       SET deleted_at = now(), deleted_by = $2, updated_by = $2, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [imageId, user.id],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND',
        message: 'Gallery image not found.',
      });
    await this.audit.write({
      actorUserId: user.id,
      propertyId: String(before.property_id),
      action: 'hunian_gallery.delete.v2',
      resourceType: 'hunian_gallery_image',
      resourceId: imageId,
      beforeData: this.auditRecord(before),
      afterData: this.auditRecord(result.rows[0]),
      resultStatus: 'success',
      ...context,
    });
    return v2Data({ id: imageId, deleted: true });
  }

  private async assertTarget(
    propertyId: string,
    targetType: 'kost_type' | 'common_area',
    kostTypeId?: string,
    commonAreaKey?: string,
  ) {
    if (targetType === 'kost_type') {
      if (!kostTypeId || commonAreaKey) {
        throw new UnprocessableEntityException({
          code: 'GALLERY_TARGET_INVALID',
          message: 'kost_type target requires only kost_type_id.',
        });
      }
      const result = await this.database.client.query<Row>(
        `SELECT id FROM kost_types WHERE id = $1 AND property_id = $2 AND deleted_at IS NULL`,
        [kostTypeId, propertyId],
      );
      if (!result.rows[0])
        throw new UnprocessableEntityException({
          code: 'PROPERTY_SCOPE_MISMATCH',
          message: 'Kost type belongs to another property.',
        });
      return;
    }
    if (
      kostTypeId ||
      !commonAreaKey ||
      !COMMON_AREA_KEYS.includes(commonAreaKey as (typeof COMMON_AREA_KEYS)[number])
    ) {
      throw new UnprocessableEntityException({
        code: 'GALLERY_TARGET_INVALID',
        message: 'common_area target requires an allowlisted common_area_key.',
      });
    }
  }

  private assertTargetQuery(query: ListHunianGalleryV2QueryDto): void {
    if (query.target_type === 'kost_type' && query.common_area_key) {
      throw new BadRequestException({
        code: 'GALLERY_TARGET_INVALID',
        message: 'kost_type query cannot include common_area_key.',
      });
    }
    if (query.target_type === 'common_area' && query.kost_type_id) {
      throw new BadRequestException({
        code: 'GALLERY_TARGET_INVALID',
        message: 'common_area query cannot include kost_type_id.',
      });
    }
  }

  private async assertGalleryFile(fileId: string, propertyId: string) {
    const result = await this.database.client.query<Row>(
      `SELECT id FROM files
       WHERE id = $1 AND property_id = $2 AND is_deleted = false AND file_purpose = 'hunian_gallery'
         AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')`,
      [fileId, propertyId],
    );
    if (!result.rows[0]) {
      throw new UnprocessableEntityException({
        code: 'HUNIAN_GALLERY_FILE_INVALID',
        message: 'Gallery file must be an active image in the same property.',
      });
    }
  }

  private async countTarget(
    propertyId: string,
    type: string,
    kostTypeId: string | null,
    commonAreaKey: string | null,
  ) {
    const result = await this.database.client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM hunian_gallery_images
       WHERE property_id = $1 AND target_type = $2
         AND kost_type_id IS NOT DISTINCT FROM $3::uuid
         AND common_area_key IS NOT DISTINCT FROM $4::text
         AND deleted_at IS NULL`,
      [propertyId, type, kostTypeId, commonAreaKey],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  private async requireImage(id: string): Promise<Row> {
    const result = await this.database.client.query<Row>(
      `SELECT * FROM hunian_gallery_images
       WHERE id = $1 AND deleted_at IS NULL AND target_type IN ('kost_type', 'common_area')`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND',
        message: 'Gallery image not found.',
      });
    return result.rows[0];
  }

  private toResponse(row: Row) {
    return {
      id: row.id,
      property_id: row.property_id,
      target_type: row.target_type,
      target_id:
        row.target_type === 'kost_type'
          ? row.kost_type_id
          : `common_area:${String(row.common_area_key)}`,
      kost_type_id: row.kost_type_id,
      kost_type_name: row.kost_type_name ?? null,
      common_area_key: row.common_area_key,
      file_id: row.file_id,
      content_url: `/api/v1/files/${String(row.file_id)}/content`,
      alt_text: row.alt_text,
      caption: row.caption,
      sort_order: Number(row.sort_order),
      is_cover: row.is_cover,
      public_visible: row.public_visible,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private auditRecord(row: Row) {
    return {
      id: row.id,
      property_id: row.property_id,
      target_type: row.target_type,
      kost_type_id: row.kost_type_id,
      common_area_key: row.common_area_key,
      file_id: row.file_id,
      public_visible: row.public_visible,
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

  private async rollback(client: { query(sql: string): Promise<unknown> }) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The query may fail before a transaction is established.
    }
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
