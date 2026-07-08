import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type { FilePurpose, FileRecord, FileStorageDriver, SupportedMimeType } from '../file/types/file.types';
import type {
  HunianCatalogTarget,
  HunianGalleryCategory,
  HunianGalleryFileRecord,
  HunianGalleryFloorCode,
  HunianGalleryGender,
  HunianGalleryRecord,
} from './types/hunian-gallery.types';

type HunianGalleryRow = {
  id: string;
  property_id: string;
  catalog_slug: string;
  public_group_key: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  building_code: string | null;
  floor_code: HunianGalleryFloorCode | null;
  file_id: string;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  public_visible: boolean;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type HunianGalleryFileRow = HunianGalleryRow & {
  file_property_id: string;
  file_uploader_user_id: string | null;
  file_original_filename: string;
  file_sanitized_filename: string;
  file_mime_type: SupportedMimeType;
  file_extension: string;
  file_size_bytes: string;
  file_purpose: FilePurpose;
  file_storage_driver: FileStorageDriver;
  file_storage_path: string;
  file_checksum_sha256: string;
  file_metadata: Record<string, unknown>;
  file_is_deleted: boolean;
  file_deleted_at: Date | null;
  file_deleted_by_user_id: string | null;
  file_created_at: Date;
  file_updated_at: Date;
};

type CatalogTargetRow = {
  property_id: string;
  category: HunianGalleryCategory;
  gender_policy: HunianGalleryGender;
  building_code: string;
  building_name: string;
  floor_code: HunianGalleryFloorCode;
  floor_label: string;
};

export type ListHunianGalleryFilters = {
  propertyId?: string;
  catalogSlug?: string;
  publicGroupKey?: string;
  category?: HunianGalleryCategory;
  gender?: HunianGalleryGender;
};

export type CreateHunianGalleryRecordInput = {
  propertyId: string;
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string | null;
  floorCode: HunianGalleryFloorCode | null;
  fileId: string;
  altText: string;
  caption: string | null;
  sortOrder: number;
  publicVisible: boolean;
  createdBy: string;
};

export type UpdateHunianGalleryRecordInput = {
  altText?: string;
  caption?: string | null;
  publicVisible?: boolean;
  sortOrder?: number;
  updatedBy: string;
};

export type FindCatalogTargetInput = {
  propertyId: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string;
  floorCode: HunianGalleryFloorCode;
};

const GALLERY_SELECT = `
  id, property_id, catalog_slug, public_group_key, category, gender, building_code,
  floor_code, file_id, alt_text, caption, sort_order, is_cover, public_visible,
  created_by, updated_by, deleted_at, deleted_by, created_at, updated_at
`;

@Injectable()
export class HunianGalleryRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(scopedPropertyIds: string[] | undefined, filters: ListHunianGalleryFilters): Promise<HunianGalleryRecord[]> {
    if (scopedPropertyIds && scopedPropertyIds.length === 0) {
      return [];
    }

    const result = await this.database.client.query<HunianGalleryRow>(
      `SELECT ${GALLERY_SELECT}
       FROM hunian_gallery_images
       WHERE deleted_at IS NULL
         AND ($1::uuid[] IS NULL OR property_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR property_id = $2)
         AND ($3::text IS NULL OR catalog_slug = $3)
         AND ($4::text IS NULL OR public_group_key = $4)
         AND ($5::text IS NULL OR category = $5)
         AND ($6::text IS NULL OR gender = $6)
       ORDER BY property_id, catalog_slug, is_cover DESC, sort_order ASC, created_at ASC`,
      [
        scopedPropertyIds ?? null,
        filters.propertyId ?? null,
        filters.catalogSlug ?? null,
        filters.publicGroupKey ?? null,
        filters.category ?? null,
        filters.gender ?? null,
      ],
    );

    return result.rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<HunianGalleryRecord | null> {
    const result = await this.database.client.query<HunianGalleryRow>(
      `SELECT ${GALLERY_SELECT}
       FROM hunian_gallery_images
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async findActiveByIds(ids: string[]): Promise<HunianGalleryRecord[]> {
    if (!ids.length) {
      return [];
    }

    const result = await this.database.client.query<HunianGalleryRow>(
      `SELECT ${GALLERY_SELECT}
       FROM hunian_gallery_images
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [ids],
    );
    return result.rows.map((row) => this.map(row));
  }

  async countActiveForCatalog(propertyId: string, catalogSlug: string): Promise<number> {
    const result = await this.database.client.query<{ total: string }>(
      `SELECT count(*) AS total
       FROM hunian_gallery_images
       WHERE property_id = $1 AND catalog_slug = $2 AND deleted_at IS NULL`,
      [propertyId, catalogSlug],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async create(input: CreateHunianGalleryRecordInput): Promise<HunianGalleryRecord> {
    const result = await this.database.client.query<HunianGalleryRow>(
      `INSERT INTO hunian_gallery_images (
         property_id, catalog_slug, public_group_key, category, gender, building_code, floor_code,
         file_id, alt_text, caption, sort_order, public_visible, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       RETURNING ${GALLERY_SELECT}`,
      [
        input.propertyId,
        input.catalogSlug,
        input.publicGroupKey,
        input.category,
        input.gender,
        input.buildingCode,
        input.floorCode,
        input.fileId,
        input.altText,
        input.caption,
        input.sortOrder,
        input.publicVisible,
        input.createdBy,
      ],
    );
    return this.map(result.rows[0]);
  }

  async update(id: string, input: UpdateHunianGalleryRecordInput): Promise<HunianGalleryRecord | null> {
    const result = await this.database.client.query<HunianGalleryRow>(
      `UPDATE hunian_gallery_images
       SET alt_text = COALESCE($2, alt_text),
           caption = CASE WHEN $3::boolean THEN $4 ELSE caption END,
           public_visible = COALESCE($5, public_visible),
           sort_order = COALESCE($6, sort_order),
           updated_by = $7,
           updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${GALLERY_SELECT}`,
      [
        id,
        input.altText ?? null,
        Object.prototype.hasOwnProperty.call(input, 'caption'),
        input.caption ?? null,
        input.publicVisible ?? null,
        input.sortOrder ?? null,
        input.updatedBy,
      ],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async softDelete(id: string, deletedBy: string): Promise<HunianGalleryRecord | null> {
    const result = await this.database.client.query<HunianGalleryRow>(
      `UPDATE hunian_gallery_images
       SET deleted_at = now(), deleted_by = $2, updated_by = $2, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${GALLERY_SELECT}`,
      [id, deletedBy],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async setCover(id: string, updatedBy: string): Promise<HunianGalleryRecord | null> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const current = await this.findByIdForUpdate(client, id);
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `UPDATE hunian_gallery_images
         SET is_cover = false, updated_by = $3, updated_at = now()
         WHERE property_id = $1 AND catalog_slug = $2 AND deleted_at IS NULL`,
        [current.propertyId, current.catalogSlug, updatedBy],
      );

      const result = await client.query<HunianGalleryRow>(
        `UPDATE hunian_gallery_images
         SET is_cover = true, updated_by = $2, updated_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING ${GALLERY_SELECT}`,
        [id, updatedBy],
      );
      await client.query('COMMIT');
      return result.rows[0] ? this.map(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reorder(items: Array<{ id: string; sortOrder: number }>, updatedBy: string): Promise<HunianGalleryRecord[]> {
    const client = await this.database.client.connect();
    try {
      await client.query('BEGIN');
      const updated: HunianGalleryRecord[] = [];
      for (const item of items) {
        const result = await client.query<HunianGalleryRow>(
          `UPDATE hunian_gallery_images
           SET sort_order = $2, updated_by = $3, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING ${GALLERY_SELECT}`,
          [item.id, item.sortOrder, updatedBy],
        );
        if (result.rows[0]) {
          updated.push(this.map(result.rows[0]));
        }
      }
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findCatalogTarget(input: FindCatalogTargetInput): Promise<HunianCatalogTarget | null> {
    const result = await this.database.client.query<CatalogTargetRow>(
      `SELECT room_buildings.property_id,
              room_buildings.category,
              room_buildings.gender_policy,
              room_buildings.building_code,
              room_buildings.building_name,
              rooms.floor_code,
              COALESCE(rooms.floor_label, rooms.floor, rooms.floor_code) AS floor_label
       FROM rooms
       JOIN room_buildings ON room_buildings.id = rooms.building_id
       WHERE room_buildings.property_id = $1
         AND room_buildings.category = $2
         AND room_buildings.gender_policy = $3
         AND room_buildings.building_code = $4
         AND rooms.floor_code = $5
         AND rooms.room_status = 'vacant'
         AND rooms.public_visible = true
         AND room_buildings.public_visible = true
         AND room_buildings.category IN ('rukost', 'apartkost')
         AND room_buildings.gender_policy IN ('male', 'female')
       GROUP BY room_buildings.property_id, room_buildings.category, room_buildings.gender_policy,
                room_buildings.building_code, room_buildings.building_name, rooms.floor_code,
                COALESCE(rooms.floor_label, rooms.floor, rooms.floor_code)
       LIMIT 1`,
      [input.propertyId, input.category, input.gender, input.buildingCode, input.floorCode],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      propertyId: row.property_id,
      catalogSlug: this.slugFor(row.category, row.gender_policy, row.building_code, row.floor_code),
      publicGroupKey: this.publicGroupKey(row.category, row.gender_policy, row.building_code, row.floor_code),
      category: row.category,
      gender: row.gender_policy,
      buildingCode: row.building_code,
      buildingName: row.building_name,
      floorCode: row.floor_code,
      floorLabel: row.floor_label,
    };
  }

  async listPublicForProperties(propertyIds: string[]): Promise<HunianGalleryRecord[]> {
    if (!propertyIds.length) {
      return [];
    }

    const result = await this.database.client.query<HunianGalleryRow>(
      `SELECT ${GALLERY_SELECT}
       FROM hunian_gallery_images
       WHERE property_id = ANY($1::uuid[])
         AND public_visible = true
         AND deleted_at IS NULL
       ORDER BY property_id, catalog_slug, is_cover DESC, sort_order ASC, created_at ASC`,
      [propertyIds],
    );
    return result.rows.map((row) => this.map(row));
  }

  async findPublicWithFile(id: string): Promise<HunianGalleryFileRecord | null> {
    const result = await this.database.client.query<HunianGalleryFileRow>(
      `SELECT hgi.id, hgi.property_id, hgi.catalog_slug, hgi.public_group_key, hgi.category, hgi.gender,
              hgi.building_code, hgi.floor_code, hgi.file_id, hgi.alt_text, hgi.caption, hgi.sort_order,
              hgi.is_cover, hgi.public_visible, hgi.created_by, hgi.updated_by, hgi.deleted_at, hgi.deleted_by,
              hgi.created_at, hgi.updated_at,
              files.property_id AS file_property_id,
              files.uploader_user_id AS file_uploader_user_id,
              files.original_filename AS file_original_filename,
              files.sanitized_filename AS file_sanitized_filename,
              files.mime_type AS file_mime_type,
              files.file_extension AS file_extension,
              files.file_size_bytes AS file_size_bytes,
              files.file_purpose AS file_purpose,
              files.storage_driver AS file_storage_driver,
              files.storage_path AS file_storage_path,
              files.checksum_sha256 AS file_checksum_sha256,
              files.metadata AS file_metadata,
              files.is_deleted AS file_is_deleted,
              files.deleted_at AS file_deleted_at,
              files.deleted_by_user_id AS file_deleted_by_user_id,
              files.created_at AS file_created_at,
              files.updated_at AS file_updated_at
       FROM hunian_gallery_images hgi
       JOIN files ON files.id = hgi.file_id
       WHERE hgi.id = $1
         AND hgi.public_visible = true
         AND hgi.deleted_at IS NULL
         AND files.is_deleted = false
         AND files.file_purpose = 'hunian_gallery'`,
      [id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return { gallery: this.map(row), file: this.mapFile(row) };
  }

  private async findByIdForUpdate(client: PoolClient, id: string): Promise<HunianGalleryRecord | null> {
    const result = await client.query<HunianGalleryRow>(
      `SELECT ${GALLERY_SELECT}
       FROM hunian_gallery_images
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [id],
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  private map(row: HunianGalleryRow): HunianGalleryRecord {
    return {
      id: row.id,
      propertyId: row.property_id,
      catalogSlug: row.catalog_slug,
      publicGroupKey: row.public_group_key,
      category: row.category,
      gender: row.gender,
      buildingCode: row.building_code,
      floorCode: row.floor_code,
      fileId: row.file_id,
      altText: row.alt_text,
      caption: row.caption,
      sortOrder: row.sort_order,
      isCover: row.is_cover,
      publicVisible: row.public_visible,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      deletedAt: row.deleted_at,
      deletedBy: row.deleted_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapFile(row: HunianGalleryFileRow): FileRecord {
    return {
      id: row.file_id,
      propertyId: row.file_property_id,
      uploaderUserId: row.file_uploader_user_id,
      originalFilename: row.file_original_filename,
      sanitizedFilename: row.file_sanitized_filename,
      mimeType: row.file_mime_type,
      fileExtension: row.file_extension,
      fileSizeBytes: Number(row.file_size_bytes),
      filePurpose: row.file_purpose,
      storageDriver: row.file_storage_driver,
      storagePath: row.file_storage_path,
      checksumSha256: row.file_checksum_sha256,
      metadata: row.file_metadata ?? {},
      isDeleted: row.file_is_deleted,
      deletedAt: row.file_deleted_at,
      deletedByUserId: row.file_deleted_by_user_id,
      createdAt: row.file_created_at,
      updatedAt: row.file_updated_at,
    };
  }

  private publicGroupKey(
    category: HunianGalleryCategory,
    gender: HunianGalleryGender,
    buildingCode: string,
    floorCode: HunianGalleryFloorCode,
  ): string {
    return `${category}-${gender}-${buildingCode}-${floorCode}`;
  }

  private slugFor(
    category: HunianGalleryCategory,
    gender: HunianGalleryGender,
    buildingCode: string,
    floorCode: HunianGalleryFloorCode,
  ): string {
    const genderSlug = gender === 'male' ? 'putra' : 'putri';
    return [category, genderSlug, 'unit', this.slugPart(buildingCode), 'lantai', floorCode.toLowerCase()].join('-');
  }

  private slugPart(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
