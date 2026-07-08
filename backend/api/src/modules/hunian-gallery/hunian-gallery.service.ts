import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepository } from '../../infrastructure/audit/audit.repository';
import { FileRepository } from '../file/file.repository';
import { FileService } from '../file/file.service';
import type { FileContent, FileRecord } from '../file/types/file.types';
import { UserAccessContext } from '../iam/types/iam.types';
import { PropertyService } from '../property/property.service';
import { CreateHunianGalleryImageDto } from './dto/create-hunian-gallery-image.dto';
import { ListHunianGalleryQueryDto } from './dto/list-hunian-gallery-query.dto';
import { ReorderHunianGalleryDto } from './dto/reorder-hunian-gallery.dto';
import { UpdateHunianGalleryImageDto } from './dto/update-hunian-gallery-image.dto';
import { HunianGalleryRepository } from './hunian-gallery.repository';
import type {
  HunianCatalogTarget,
  HunianGalleryAdminResponse,
  HunianGalleryCategory,
  HunianGalleryFloorCode,
  HunianGalleryGender,
  HunianGalleryPublicResponse,
  HunianGalleryRecord,
} from './types/hunian-gallery.types';

type RequestAuditContext = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

type PublicCatalogTargetRef = {
  propertyId: string;
  catalogSlug: string;
};

type NormalizedGalleryTargetInput = {
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string;
  floorCode: HunianGalleryFloorCode;
};

const MAX_GALLERY_IMAGES_PER_CATALOG = 10;

const PUBLIC_TEXT_FORBIDDEN_PATTERNS = [
  /storage[_ -]?path/i,
  /file[_ -]?path/i,
  /room[_ -]?id/i,
  /roomid/i,
  /room[_ -]?code/i,
  /roomcode/i,
  /tenant/i,
  /resident/i,
  /occupancy/i,
  /invoice/i,
  /paymentstatus/i,
  /rekening/i,
  /smart\s*lock/i,
  /smartlock/i,
  /paloma/i,
  /bsi\s*7318321153/i,
  /\b(room|kamar)\s*[a-z]?\d{2,}\b/i,
];

@Injectable()
export class HunianGalleryService {
  constructor(
    private readonly gallery: HunianGalleryRepository,
    private readonly files: FileRepository,
    private readonly fileService: FileService,
    private readonly properties: PropertyService,
    private readonly audit: AuditRepository,
  ) {}

  async list(user: UserAccessContext, query: ListHunianGalleryQueryDto): Promise<HunianGalleryAdminResponse[]> {
    const propertyIds = await this.scopedPropertyIds(user, query.property_id);
    const records = await this.gallery.list(propertyIds, {
      propertyId: query.property_id,
      catalogSlug: query.catalogSlug,
      publicGroupKey: query.publicGroupKey,
      category: query.category,
      gender: query.gender,
    });
    return records.map((record) => this.toAdminResponse(record));
  }

  async create(
    user: UserAccessContext,
    dto: CreateHunianGalleryImageDto,
    context: RequestAuditContext,
  ): Promise<HunianGalleryAdminResponse> {
    const file = await this.requireGalleryFile(dto.fileId);
    await this.assertCanMutateProperty(user, file.propertyId);

    const normalizedTarget = this.normalizeTargetInput(dto);
    const target = await this.requireCatalogTarget(file.propertyId, normalizedTarget);
    const count = await this.gallery.countActiveForCatalog(target.propertyId, target.catalogSlug);
    if (count >= MAX_GALLERY_IMAGES_PER_CATALOG) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_LIMIT_EXCEEDED',
        message: 'A public catalog item can have at most 10 active gallery images.',
      });
    }

    this.assertPublicTextSafe(dto.altText, 'altText');
    this.assertPublicTextSafe(dto.caption ?? null, 'caption');

    const record = await this.gallery.create({
      propertyId: target.propertyId,
      catalogSlug: target.catalogSlug,
      publicGroupKey: target.publicGroupKey,
      category: target.category,
      gender: target.gender,
      buildingCode: target.buildingCode,
      floorCode: target.floorCode,
      fileId: file.id,
      altText: dto.altText,
      caption: dto.caption ?? null,
      sortOrder: dto.sortOrder ?? count,
      publicVisible: dto.publicVisible ?? false,
      createdBy: user.id,
    });

    await this.audit.write({
      actorUserId: user.id,
      propertyId: record.propertyId,
      action: 'hunian_gallery.attach',
      resourceType: 'hunian_gallery_image',
      resourceId: record.id,
      afterData: this.auditPayload(record),
      resultStatus: 'success',
      ...context,
    });

    return this.toAdminResponse(record);
  }

  async update(
    user: UserAccessContext,
    imageId: string,
    dto: UpdateHunianGalleryImageDto,
    context: RequestAuditContext,
  ): Promise<HunianGalleryAdminResponse> {
    const before = await this.requireImage(imageId);
    await this.assertCanMutateProperty(user, before.propertyId);
    if (dto.altText !== undefined) this.assertPublicTextSafe(dto.altText, 'altText');
    if (Object.prototype.hasOwnProperty.call(dto, 'caption')) this.assertPublicTextSafe(dto.caption ?? null, 'caption');

    const updated = await this.gallery.update(imageId, {
      altText: dto.altText,
      caption: dto.caption,
      publicVisible: dto.publicVisible,
      sortOrder: dto.sortOrder,
      updatedBy: user.id,
    });
    if (!updated) {
      throw new NotFoundException({ code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND', message: 'Gallery image not found.' });
    }

    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'hunian_gallery.update',
      resourceType: 'hunian_gallery_image',
      resourceId: updated.id,
      beforeData: this.auditPayload(before),
      afterData: this.auditPayload(updated),
      resultStatus: 'success',
      ...context,
    });

    return this.toAdminResponse(updated);
  }

  async setCover(
    user: UserAccessContext,
    imageId: string,
    context: RequestAuditContext,
  ): Promise<HunianGalleryAdminResponse> {
    const before = await this.requireImage(imageId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const updated = await this.gallery.setCover(imageId, user.id);
    if (!updated) {
      throw new NotFoundException({ code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND', message: 'Gallery image not found.' });
    }

    await this.audit.write({
      actorUserId: user.id,
      propertyId: updated.propertyId,
      action: 'hunian_gallery.set_cover',
      resourceType: 'hunian_gallery_image',
      resourceId: updated.id,
      beforeData: this.auditPayload(before),
      afterData: this.auditPayload(updated),
      resultStatus: 'success',
      ...context,
    });

    return this.toAdminResponse(updated);
  }

  async reorder(
    user: UserAccessContext,
    dto: ReorderHunianGalleryDto,
    context: RequestAuditContext,
  ): Promise<HunianGalleryAdminResponse[]> {
    const ids = dto.items.map((item) => item.id);
    const records = await this.gallery.findActiveByIds(ids);
    if (records.length !== ids.length) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_REORDER_INVALID_ITEMS',
        message: 'All reorder items must reference active gallery images.',
      });
    }

    const propertyId = records[0]?.propertyId;
    if (!propertyId) {
      throw new BadRequestException({ code: 'HUNIAN_GALLERY_REORDER_EMPTY', message: 'Reorder items are required.' });
    }
    await this.assertCanMutateProperty(user, propertyId);

    const sameCatalog = records.every(
      (record) => record.propertyId === propertyId && record.catalogSlug === dto.catalogSlug,
    );
    if (!sameCatalog) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_REORDER_SCOPE_MISMATCH',
        message: 'All reorder items must belong to the same catalog item.',
      });
    }

    const updated = await this.gallery.reorder(dto.items, user.id);
    await this.audit.write({
      actorUserId: user.id,
      propertyId,
      action: 'hunian_gallery.reorder',
      resourceType: 'hunian_gallery_image',
      afterData: { catalogSlug: dto.catalogSlug, items: dto.items },
      resultStatus: 'success',
      ...context,
    });

    return updated.map((record) => this.toAdminResponse(record));
  }

  async delete(
    user: UserAccessContext,
    imageId: string,
    context: RequestAuditContext,
  ): Promise<{ success: true; image: HunianGalleryAdminResponse }> {
    const before = await this.requireImage(imageId);
    await this.assertCanMutateProperty(user, before.propertyId);
    const deleted = await this.gallery.softDelete(imageId, user.id);
    if (!deleted) {
      throw new NotFoundException({ code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND', message: 'Gallery image not found.' });
    }

    await this.audit.write({
      actorUserId: user.id,
      propertyId: deleted.propertyId,
      action: 'hunian_gallery.delete',
      resourceType: 'hunian_gallery_image',
      resourceId: deleted.id,
      beforeData: this.auditPayload(before),
      afterData: this.auditPayload(deleted),
      resultStatus: 'success',
      ...context,
    });

    return { success: true, image: this.toAdminResponse(deleted) };
  }

  async publicGalleryForCatalogTargets(
    targets: PublicCatalogTargetRef[],
  ): Promise<Map<string, HunianGalleryPublicResponse[]>> {
    const propertyIds = [...new Set(targets.map((target) => target.propertyId))];
    const targetKeys = new Set(targets.map((target) => this.publicMapKey(target.propertyId, target.catalogSlug)));
    const records = await this.gallery.listPublicForProperties(propertyIds);
    const grouped = new Map<string, HunianGalleryPublicResponse[]>();

    for (const record of records) {
      const key = this.publicMapKey(record.propertyId, record.catalogSlug);
      if (!targetKeys.has(key)) {
        continue;
      }
      const items = grouped.get(key) ?? [];
      items.push(this.toPublicResponse(record));
      grouped.set(key, items);
    }

    return grouped;
  }

  async readPublicContent(imageId: string): Promise<FileContent> {
    const record = await this.gallery.findPublicWithFile(imageId);
    if (!record) {
      throw new NotFoundException({ code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND', message: 'Gallery image not found.' });
    }
    return this.fileService.readStoredContent(record.file);
  }

  publicMapKey(propertyId: string, catalogSlug: string): string {
    return `${propertyId}:${catalogSlug}`;
  }

  toPublicResponse(record: HunianGalleryRecord): HunianGalleryPublicResponse {
    return {
      id: record.id,
      contentUrl: `/api/v1/public/hunian-gallery/${record.id}/content`,
      thumbnailUrl: null,
      altText: record.altText,
      caption: record.caption,
      sortOrder: record.sortOrder,
      isCover: record.isCover,
    };
  }

  private async scopedPropertyIds(user: UserAccessContext, propertyId?: string): Promise<string[] | undefined> {
    if (propertyId) {
      await this.properties.assertCanReadProperty(user, propertyId);
      return user.roles.includes('owner') ? undefined : [propertyId];
    }
    return user.roles.includes('owner') ? undefined : user.propertyIds;
  }

  private async assertCanMutateProperty(user: UserAccessContext, propertyId: string): Promise<void> {
    if (user.roles.includes('property_owner')) {
      throw new ForbiddenException({
        code: 'PROPERTY_OWNER_READ_ONLY',
        message: 'Property owner cannot mutate gallery data.',
      });
    }
    await this.properties.assertCanReadProperty(user, propertyId);
  }

  private async requireImage(imageId: string): Promise<HunianGalleryRecord> {
    const record = await this.gallery.findById(imageId);
    if (!record) {
      throw new NotFoundException({ code: 'HUNIAN_GALLERY_IMAGE_NOT_FOUND', message: 'Gallery image not found.' });
    }
    return record;
  }

  private async requireGalleryFile(fileId: string): Promise<FileRecord> {
    const file = await this.files.findById(fileId);
    if (!file || file.isDeleted) {
      throw new BadRequestException({ code: 'HUNIAN_GALLERY_FILE_INVALID', message: 'Gallery file is invalid.' });
    }
    if (file.filePurpose !== 'hunian_gallery') {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_FILE_PURPOSE_INVALID',
        message: 'Gallery file must use hunian_gallery purpose.',
      });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType)) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_FILE_TYPE_INVALID',
        message: 'Gallery file must be a JPEG, PNG, or WebP image.',
      });
    }
    return file;
  }

  private normalizeTargetInput(dto: CreateHunianGalleryImageDto): NormalizedGalleryTargetInput {
    const parsed = this.parsePublicGroupKey(dto.publicGroupKey);
    if (parsed.category !== dto.category || parsed.gender !== dto.gender) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_GROUP_KEY_MISMATCH',
        message: 'publicGroupKey does not match category and gender.',
      });
    }

    const buildingCode = dto.buildingCode ?? parsed.buildingCode;
    const floorCode = dto.floorCode ?? parsed.floorCode;
    if (!buildingCode) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_BUILDING_REQUIRED',
        message: 'buildingCode is required for the selected catalog item.',
      });
    }

    return {
      catalogSlug: dto.catalogSlug,
      publicGroupKey: this.publicGroupKey(dto.category, dto.gender, buildingCode, floorCode),
      category: dto.category,
      gender: dto.gender,
      buildingCode,
      floorCode,
    };
  }

  private async requireCatalogTarget(
    propertyId: string,
    input: NormalizedGalleryTargetInput,
  ): Promise<HunianCatalogTarget> {
    const target = await this.gallery.findCatalogTarget({
      propertyId,
      category: input.category,
      gender: input.gender,
      buildingCode: input.buildingCode,
      floorCode: input.floorCode,
    });

    if (!target) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_CATALOG_TARGET_NOT_FOUND',
        message: 'Public hunian catalog target is not available.',
      });
    }

    if (target.catalogSlug !== input.catalogSlug || target.publicGroupKey !== input.publicGroupKey) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_CATALOG_TARGET_MISMATCH',
        message: 'Gallery target does not match the public catalog contract.',
      });
    }

    return target;
  }

  private parsePublicGroupKey(publicGroupKey: string): Omit<NormalizedGalleryTargetInput, 'catalogSlug' | 'publicGroupKey'> {
    const parts = publicGroupKey.split('-');
    if (parts.length < 4) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_GROUP_KEY_INVALID',
        message: 'publicGroupKey is invalid.',
      });
    }

    const category = parts.shift() as HunianGalleryCategory;
    const gender = parts.shift() as HunianGalleryGender;
    const floor = parts.pop()?.toUpperCase() as HunianGalleryFloorCode | undefined;
    const buildingCode = parts.join('-');

    if (!['rukost', 'apartkost'].includes(category) || !['male', 'female'].includes(gender) || !floor || !['A', 'B'].includes(floor)) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_GROUP_KEY_INVALID',
        message: 'publicGroupKey is invalid.',
      });
    }

    return { category, gender, buildingCode, floorCode: floor };
  }

  private publicGroupKey(
    category: HunianGalleryCategory,
    gender: HunianGalleryGender,
    buildingCode: string,
    floorCode: HunianGalleryFloorCode,
  ): string {
    return `${category}-${gender}-${buildingCode}-${floorCode}`;
  }

  private assertPublicTextSafe(value: string | null | undefined, field: string): void {
    if (!value) {
      return;
    }
    if (PUBLIC_TEXT_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new BadRequestException({
        code: 'HUNIAN_GALLERY_PUBLIC_TEXT_UNSAFE',
        message: `${field} contains internal or unsafe public content.`,
      });
    }
  }

  private toAdminResponse(record: HunianGalleryRecord): HunianGalleryAdminResponse {
    return {
      id: record.id,
      catalogSlug: record.catalogSlug,
      publicGroupKey: record.publicGroupKey,
      category: record.category,
      gender: record.gender,
      buildingCode: record.buildingCode,
      floorCode: record.floorCode,
      fileId: record.fileId,
      contentUrl: `/api/v1/files/${record.fileId}/content`,
      thumbnailUrl: null,
      altText: record.altText,
      caption: record.caption,
      sortOrder: record.sortOrder,
      isCover: record.isCover,
      publicVisible: record.publicVisible,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private auditPayload(record: HunianGalleryRecord): Record<string, unknown> {
    return {
      galleryImageId: record.id,
      propertyId: record.propertyId,
      catalogSlug: record.catalogSlug,
      publicGroupKey: record.publicGroupKey,
      fileId: record.fileId,
      sortOrder: record.sortOrder,
      isCover: record.isCover,
      publicVisible: record.publicVisible,
      deleted: record.deletedAt !== null,
    };
  }
}
