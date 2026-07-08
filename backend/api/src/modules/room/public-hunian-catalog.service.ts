import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HunianGalleryService } from '../hunian-gallery/hunian-gallery.service';
import { PublicHunianCatalogQueryDto } from './dto/public-hunian-catalog-query.dto';
import { PUBLIC_HUNIAN_CATALOG_CONTENT } from './public-hunian-catalog.content';
import { RoomRepository } from './repositories/room.repository';
import {
  PublicRoomAvailabilityFilters,
  PublicRoomAvailabilityGroupRecord,
  PublicRoomGenderPolicy,
  RoomCategory,
  RoomFloorCode,
} from './types/room.types';
import {
  PublicHunianCatalogBookingLeadDefaults,
  PublicHunianCatalogDetailItem,
  PublicHunianCatalogListItem,
} from './types/public-hunian-catalog.types';

const CATEGORY_LABEL: Record<RoomCategory, string> = {
  rukost: 'Rumah Kost',
  apartkost: 'Apart Kost',
};

const GENDER_LABEL: Record<PublicRoomGenderPolicy, string> = {
  male: 'Putra',
  female: 'Putri',
};

const GENDER_SLUG: Record<PublicRoomGenderPolicy, string> = {
  male: 'putra',
  female: 'putri',
};

const FLOOR_LABEL: Record<RoomFloorCode, string> = {
  A: 'Lantai Atas / LT.2',
  B: 'Lantai Bawah / LT.1',
};

@Injectable()
export class PublicHunianCatalogService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly gallery: HunianGalleryService,
  ) {}

  async list(query: PublicHunianCatalogQueryDto) {
    const groups = await this.rooms.listPublicAvailabilityGroups(this.normalizeFilters(query));
    const galleryByCatalog = await this.gallery.publicGalleryForCatalogTargets(
      groups.map((group) => ({ propertyId: group.propertyId, catalogSlug: this.slugFor(group) })),
    );
    return {
      data: groups.map((group) =>
        this.mapListItem(group, galleryByCatalog.get(this.gallery.publicMapKey(group.propertyId, this.slugFor(group))) ?? []),
      ),
      summary: {
        totalItems: groups.length,
        totalAvailable: groups.reduce((sum, group) => sum + group.availableCount, 0),
      },
    };
  }

  async detail(slug: string) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException({
        code: 'PUBLIC_HUNIAN_CATALOG_SLUG_INVALID',
        message: 'Public hunian catalog slug is invalid.',
      });
    }

    const groups = await this.rooms.listPublicAvailabilityGroups({});
    const group = groups.find((item) => this.slugFor(item) === slug);

    if (!group) {
      throw new NotFoundException({
        code: 'PUBLIC_HUNIAN_CATALOG_NOT_FOUND',
        message: 'Public hunian catalog item is not available.',
      });
    }

    const galleryByCatalog = await this.gallery.publicGalleryForCatalogTargets([
      { propertyId: group.propertyId, catalogSlug: this.slugFor(group) },
    ]);

    return {
      data: this.mapDetailItem(
        group,
        galleryByCatalog.get(this.gallery.publicMapKey(group.propertyId, this.slugFor(group))) ?? [],
      ),
    };
  }

  private normalizeFilters(query: PublicHunianCatalogQueryDto): PublicRoomAvailabilityFilters {
    return {
      category: query.category,
      gender: query.gender,
    };
  }

  private mapListItem(
    group: PublicRoomAvailabilityGroupRecord,
    gallery: PublicHunianCatalogListItem['galleryPreview'],
  ): PublicHunianCatalogListItem {
    const floorLabel = group.floorLabel || FLOOR_LABEL[group.floorCode];
    const publicGroupKey = this.publicGroupKey(group);
    const title = `${CATEGORY_LABEL[group.category]} ${GENDER_LABEL[group.gender]} - ${group.buildingName} (${floorLabel})`;

    return {
      slug: this.slugFor(group),
      title,
      category: group.category,
      categoryLabel: CATEGORY_LABEL[group.category],
      gender: group.gender,
      genderLabel: GENDER_LABEL[group.gender],
      buildingCode: group.buildingCode,
      buildingName: group.buildingName,
      floorCode: group.floorCode,
      floorLabel,
      publicGroupKey,
      shortDescription: PUBLIC_HUNIAN_CATALOG_CONTENT.shortDescription,
      priceFromMonthly: Number.isFinite(group.priceFromMonthly) ? group.priceFromMonthly : null,
      priceFromYearly: Number.isFinite(group.priceFromYearly) ? group.priceFromYearly : null,
      availabilityCount: group.availableCount,
      facilitiesPreview: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesPreview],
      galleryPreview: gallery.length ? [gallery[0]] : [],
      ctaLabel: PUBLIC_HUNIAN_CATALOG_CONTENT.ctaLabel,
      bookingLeadDefaults: this.bookingLeadDefaults(group, publicGroupKey),
      disclaimers: [...PUBLIC_HUNIAN_CATALOG_CONTENT.disclaimers],
    };
  }

  private mapDetailItem(
    group: PublicRoomAvailabilityGroupRecord,
    gallery: PublicHunianCatalogDetailItem['gallery'],
  ): PublicHunianCatalogDetailItem {
    return {
      ...this.mapListItem(group, gallery),
      longDescription: PUBLIC_HUNIAN_CATALOG_CONTENT.longDescription,
      facilitiesRoom: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesRoom],
      facilitiesBathroom: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesBathroom],
      facilitiesShared: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesShared],
      facilitiesSecurity: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesSecurity],
      facilitiesService: [...PUBLIC_HUNIAN_CATALOG_CONTENT.facilitiesService],
      policies: [...PUBLIC_HUNIAN_CATALOG_CONTENT.policies],
      rules: [...PUBLIC_HUNIAN_CATALOG_CONTENT.rules],
      faq: PUBLIC_HUNIAN_CATALOG_CONTENT.faq.map((item) => ({ ...item })),
      gallery,
      needsConfirmation: [...PUBLIC_HUNIAN_CATALOG_CONTENT.needsConfirmation],
    };
  }

  private bookingLeadDefaults(
    group: PublicRoomAvailabilityGroupRecord,
    publicGroupKey: string,
  ): PublicHunianCatalogBookingLeadDefaults {
    return {
      category: group.category,
      gender: group.gender,
      buildingCode: group.buildingCode,
      floorCode: group.floorCode,
      publicGroupKey,
    };
  }

  private publicGroupKey(
    group: Pick<PublicRoomAvailabilityGroupRecord, 'category' | 'gender' | 'buildingCode' | 'floorCode'>,
  ) {
    return `${group.category}-${group.gender}-${group.buildingCode}-${group.floorCode}`;
  }

  private slugFor(
    group: Pick<PublicRoomAvailabilityGroupRecord, 'category' | 'gender' | 'buildingCode' | 'floorCode'>,
  ) {
    return [
      group.category,
      GENDER_SLUG[group.gender],
      'unit',
      this.slugPart(group.buildingCode),
      'lantai',
      group.floorCode.toLowerCase(),
    ].join('-');
  }

  private slugPart(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
