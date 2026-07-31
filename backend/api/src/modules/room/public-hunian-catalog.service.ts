import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AdminUxContentPublicationService } from '../admin-ux-master/admin-ux-content-publication.service';
import { PublicHunianCatalogQueryDto } from './dto/public-hunian-catalog-query.dto';
import { RoomRepository } from './repositories/room.repository';
import { PublicCatalogGroupRecord, PublicRoomGenderPolicy, RoomCategory } from './types/room.types';
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

type PublishedProjection = {
  category: RoomCategory;
  facilities: Array<{ label: unknown }>;
  gallery: Array<{
    content_url: string;
    alt_text: string;
    caption: string | null;
    sort_order: number;
    is_cover: boolean;
  }>;
  terms: {
    pricing_explanation: string;
    minimum_lease_term: string;
    dp_explanation: string;
    security_deposit_explanation: string;
    manual_payment_methods: string[];
    house_rules: string[];
    visitor_hours: string | null;
    contact_information: string;
  } | null;
};

type PublicCategoryGroup = {
  propertyId: string;
  category: RoomCategory;
  availabilityCount: number;
  genderAvailability: Array<{
    gender: PublicRoomGenderPolicy;
    availabilityCount: number;
  }>;
  priceFromMonthly: number;
  priceFromYearly: number;
  minimumDpPercent: number;
  securityDepositMonths: number;
  paymentSchedules: string[];
};

@Injectable()
export class PublicHunianCatalogService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly content: AdminUxContentPublicationService,
    private readonly database: DatabaseService,
  ) {}

  async list(query: PublicHunianCatalogQueryDto) {
    if (query.planned_start) {
      const { today, max } = this.jakartaDateBounds();
      if (query.planned_start < today || query.planned_start > max) {
        throw new BadRequestException({
          code: 'PUBLIC_HUNIAN_PLANNED_START_OUT_OF_RANGE',
          message: 'Planned start must be within the next two months.',
        });
      }
    }
    const published = await this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const groups = await this.rooms.listPublicCatalogGroups(
        {
          category: query.category,
          gender: query.gender,
        },
        client,
      );
      const categoryGroups = this.categoryGroups(groups).filter(
        (group) =>
          !query.payment_schedule || group.paymentSchedules.includes(query.payment_schedule),
      );
      return this.publishedCategories(client, categoryGroups);
    });
    return {
      data: published.map(({ group, projection }) =>
        this.mapListItem(group, projection, this.publicGallery(projection.gallery)),
      ),
      summary: {
        totalItems: published.length,
        totalAvailable: published.reduce((sum, { group }) => sum + group.availabilityCount, 0),
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

    const published = await this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const groups = await this.rooms.listPublicCatalogGroups({}, client);
      return this.publishedCategories(client, this.categoryGroups(groups));
    });
    const matches = published.filter(({ group: item }) => this.slugFor(item) === slug);
    if (matches.length !== 1) {
      throw new NotFoundException({
        code: 'PUBLIC_HUNIAN_CATALOG_NOT_FOUND',
        message: 'Public hunian catalog item is not available.',
      });
    }
    const match = matches[0];
    const group = match.group;

    return {
      data: this.mapDetailItem(
        group,
        match.projection,
        this.publicGallery(match.projection.gallery),
      ),
    };
  }

  async categoryContent(slug: string) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException({
        code: 'PUBLIC_HUNIAN_CATALOG_SLUG_INVALID',
        message: 'Public hunian catalog slug is invalid.',
      });
    }
    const groups = await this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const records = await this.rooms.listPublicCatalogGroups({}, client);
      return this.publishedCategories(client, this.categoryGroups(records));
    });
    const matches = groups.filter(({ group: item }) => this.slugFor(item) === slug);
    if (matches.length !== 1) {
      throw new NotFoundException({
        code: 'PUBLIC_HUNIAN_CATALOG_NOT_FOUND',
        message: 'Public hunian catalog item is not available.',
      });
    }
    return matches[0].response;
  }

  private mapListItem(
    group: PublicCategoryGroup,
    projection: PublishedProjection & { terms: NonNullable<PublishedProjection['terms']> },
    gallery: PublicHunianCatalogListItem['galleryPreview'],
  ): PublicHunianCatalogListItem {
    const title = CATEGORY_LABEL[group.category];

    return {
      slug: this.slugFor(group),
      title,
      category: group.category,
      categoryLabel: CATEGORY_LABEL[group.category],
      shortDescription: projection.terms.pricing_explanation,
      priceFromMonthly: Number.isFinite(group.priceFromMonthly) ? group.priceFromMonthly : null,
      priceFromYearly: Number.isFinite(group.priceFromYearly) ? group.priceFromYearly : null,
      availabilityCount: group.availabilityCount,
      facilitiesPreview: projection.facilities.map((item) => String(item.label)).slice(0, 5),
      galleryPreview: gallery.length ? [gallery[0]] : [],
      ctaLabel: 'Ajukan Minat Booking',
      bookingLeadDefaults: this.bookingLeadDefaults(group),
      disclaimers: [
        'Pengajuan minat belum menjadi reservasi atau hold.',
        'Nomor kamar dikonfirmasi oleh Admin.',
      ],
      leaseMinimumMonths: 12,
      paymentSchedules: [...group.paymentSchedules],
      dpMinimumPercent: group.minimumDpPercent,
      securityDepositMonths: group.securityDepositMonths,
      genderAvailability: group.genderAvailability.map((item) => ({
        gender: item.gender,
        genderLabel: GENDER_LABEL[item.gender],
        availabilityCount: item.availabilityCount,
      })),
    };
  }

  private mapDetailItem(
    group: PublicCategoryGroup,
    projection: PublishedProjection & { terms: NonNullable<PublishedProjection['terms']> },
    gallery: PublicHunianCatalogDetailItem['gallery'],
  ): PublicHunianCatalogDetailItem {
    return {
      ...this.mapListItem(group, projection, gallery),
      longDescription: projection.terms.pricing_explanation,
      facilities: projection.facilities.map((item) => String(item.label)),
      pricingExplanation: projection.terms.pricing_explanation,
      minimumLeaseTerm: projection.terms.minimum_lease_term,
      dpExplanation: projection.terms.dp_explanation,
      securityDepositExplanation: projection.terms.security_deposit_explanation,
      manualPaymentMethods: [...projection.terms.manual_payment_methods],
      houseRules: [...projection.terms.house_rules],
      visitorHours: projection.terms.visitor_hours,
      contactInformation: projection.terms.contact_information,
      gallery,
    };
  }

  private bookingLeadDefaults(group: PublicCategoryGroup): PublicHunianCatalogBookingLeadDefaults {
    return {
      category: group.category,
    };
  }
  private slugFor(group: Pick<PublicCategoryGroup, 'category'>) {
    return group.category;
  }

  private async publishedCategories(
    client: PoolClient,
    groups: PublicCategoryGroup[],
  ): Promise<
    Array<{
      group: PublicCategoryGroup;
      projection: PublishedProjection & { terms: NonNullable<PublishedProjection['terms']> };
      response: unknown;
    }>
  > {
    const responses = await this.content.publicProjectionBatchWithinSnapshot(
      client,
      groups.map((group) => ({ propertyId: group.propertyId, category: group.category })),
    );
    return responses.flatMap((response, index) => {
      const group = groups[index];
      const projection = response.data as unknown as PublishedProjection;
      if (!group || projection.category !== group.category) {
        throw new ServiceUnavailableException({
          code: 'PUBLIC_HUNIAN_CATEGORY_AUTHORITY_MISMATCH',
          message: 'Public catalog authority requires reconciliation.',
        });
      }
      if (!projection.terms) return [];
      return [
        {
          group,
          projection: projection as PublishedProjection & {
            terms: NonNullable<PublishedProjection['terms']>;
          },
          response,
        },
      ];
    });
  }

  private categoryGroups(groups: PublicCatalogGroupRecord[]): PublicCategoryGroup[] {
    const propertyIds = new Set(groups.map((group) => group.propertyId));
    if (propertyIds.size > 1) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_HUNIAN_PROPERTY_AMBIGUOUS',
        message: 'Public catalog authority requires reconciliation.',
      });
    }

    const byCategory = new Map<RoomCategory, PublicCatalogGroupRecord[]>();
    for (const group of groups) {
      const existing = byCategory.get(group.category) ?? [];
      existing.push(group);
      byCategory.set(group.category, existing);
    }
    if (byCategory.size > 2) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_HUNIAN_CATEGORY_AMBIGUOUS',
        message: 'Public catalog authority requires reconciliation.',
      });
    }

    return [...byCategory.entries()].map(([category, records]) => {
      const first = records[0];
      if (!first) {
        throw new ServiceUnavailableException({
          code: 'PUBLIC_HUNIAN_CATEGORY_AMBIGUOUS',
          message: 'Public catalog authority requires reconciliation.',
        });
      }
      const schedules = JSON.stringify([...first.paymentSchedules].sort());
      const canonicalSchedules = JSON.stringify(['annual', 'two_month_installments']);
      if (
        !Number.isSafeInteger(first.priceFromMonthly) ||
        first.priceFromMonthly < 0 ||
        !Number.isSafeInteger(first.priceFromYearly) ||
        first.priceFromYearly < 0 ||
        first.minimumDpPercent !== 25 ||
        first.securityDepositMonths !== 1 ||
        schedules !== canonicalSchedules
      ) {
        throw new ServiceUnavailableException({
          code: 'PUBLIC_HUNIAN_COMMERCIAL_AUTHORITY_INVALID',
          message: 'Public catalog authority requires reconciliation.',
        });
      }
      const genders = new Set<PublicRoomGenderPolicy>();
      for (const record of records) {
        if (
          !Number.isSafeInteger(record.availableCount) ||
          record.availableCount < 0 ||
          record.propertyId !== first.propertyId ||
          record.priceFromMonthly !== first.priceFromMonthly ||
          record.priceFromYearly !== first.priceFromYearly ||
          record.minimumDpPercent !== first.minimumDpPercent ||
          record.securityDepositMonths !== first.securityDepositMonths ||
          JSON.stringify([...record.paymentSchedules].sort()) !== schedules ||
          genders.has(record.gender)
        ) {
          throw new ServiceUnavailableException({
            code: 'PUBLIC_HUNIAN_CATEGORY_AMBIGUOUS',
            message: 'Public catalog authority requires reconciliation.',
          });
        }
        genders.add(record.gender);
      }
      return {
        propertyId: first.propertyId,
        category,
        availabilityCount: records.reduce((sum, record) => sum + record.availableCount, 0),
        genderAvailability: records
          .map((record) => ({
            gender: record.gender,
            availabilityCount: record.availableCount,
          }))
          .sort((left, right) => left.gender.localeCompare(right.gender)),
        priceFromMonthly: first.priceFromMonthly,
        priceFromYearly: first.priceFromYearly,
        minimumDpPercent: first.minimumDpPercent,
        securityDepositMonths: first.securityDepositMonths,
        paymentSchedules: [...first.paymentSchedules].sort(),
      };
    });
  }

  private jakartaDateBounds(now = new Date()): { today: string; max: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const today = `${value('year')}-${value('month')}-${value('day')}`;
    const [year, month, day] = today.split('-').map(Number);
    const max = new Date(Date.UTC(year, month - 1, day + 62)).toISOString().slice(0, 10);
    return { today, max };
  }

  private publicGallery(
    images: Array<{
      content_url: string;
      alt_text: string;
      caption: string | null;
      sort_order: number;
      is_cover: boolean;
    }>,
  ) {
    return images.map((image) => ({
      contentUrl: image.content_url,
      thumbnailUrl: null,
      altText: image.alt_text,
      caption: image.caption,
      sortOrder: image.sort_order,
      isCover: image.is_cover,
    }));
  }
}
