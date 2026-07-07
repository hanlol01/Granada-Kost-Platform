import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicRoomAvailabilityQueryDto, PublicRoomGenderInput } from './dto/public-room-query.dto';
import { RoomRepository } from './repositories/room.repository';
import {
  PublicRoomAvailabilityFilters,
  PublicRoomAvailabilityGroupRecord,
  PublicRoomGenderPolicy,
  RoomCategory,
  RoomFloorCode,
} from './types/room.types';

const CATEGORY_LABEL: Record<RoomCategory, string> = {
  rukost: 'Rumah Kost',
  apartkost: 'Apart Kost',
};

const GENDER_LABEL: Record<PublicRoomGenderPolicy, string> = {
  male: 'Putra',
  female: 'Putri',
};

const FLOOR_LABEL: Record<RoomFloorCode, string> = {
  A: 'Lantai Atas / LT.2',
  B: 'Lantai Bawah / LT.1',
};

@Injectable()
export class PublicRoomService {
  constructor(private readonly rooms: RoomRepository) {}

  async availability(query: PublicRoomAvailabilityQueryDto) {
    const filters = this.normalizeFilters(query);
    const groups = await this.rooms.listPublicAvailabilityGroups(filters);

    return {
      data: groups.map((group) => this.mapAvailabilityGroup(group)),
      summary: this.buildAvailabilitySummary(groups),
    };
  }

  async summary() {
    const groups = await this.rooms.listPublicAvailabilityGroups({});
    const totalAvailable = groups.reduce((sum, group) => sum + group.availableCount, 0);

    return {
      data: {
        totalAvailable,
        categories: (['rukost', 'apartkost'] as const).map((category) => ({
          category,
          categoryLabel: CATEGORY_LABEL[category],
          availableCount: this.sumBy(groups, (group) => group.category === category),
        })),
        genders: (['male', 'female'] as const).map((gender) => ({
          gender,
          genderLabel: GENDER_LABEL[gender],
          availableCount: this.sumBy(groups, (group) => group.gender === gender),
        })),
        categoryGenders: (['rukost', 'apartkost'] as const).flatMap((category) =>
          (['male', 'female'] as const).map((gender) => ({
            category,
            categoryLabel: CATEGORY_LABEL[category],
            gender,
            genderLabel: GENDER_LABEL[gender],
            availableCount: this.sumBy(groups, (group) => group.category === category && group.gender === gender),
          })),
        ),
      },
    };
  }

  async groupDetail(groupKey: string) {
    const filters = this.parseGroupKey(groupKey);
    const groups = await this.rooms.listPublicAvailabilityGroups(filters);
    const group = groups[0];

    if (!group) {
      throw new NotFoundException({
        code: 'PUBLIC_ROOM_GROUP_NOT_FOUND',
        message: 'Public room group is not available.',
      });
    }

    const mapped = this.mapAvailabilityGroup(group);
    return {
      data: {
        ...mapped,
        description:
          'Ketersediaan bersifat agregat. Nomor kamar dan penempatan final dikonfirmasi oleh admin melalui WhatsApp.',
      },
    };
  }

  private normalizeFilters(query: PublicRoomAvailabilityQueryDto): PublicRoomAvailabilityFilters {
    return {
      gender: query.gender ? this.normalizeGender(query.gender) : undefined,
      category: query.category,
      buildingCode: query.buildingCode,
      floorCode: query.floorCode,
    };
  }

  private normalizeGender(gender: PublicRoomGenderInput): PublicRoomGenderPolicy {
    if (gender === 'putra' || gender === 'male') return 'male';
    return 'female';
  }

  private parseGroupKey(groupKey: string): Required<PublicRoomAvailabilityFilters> {
    const [category, gender, buildingCode, floorCode, ...extra] = groupKey.split('-');
    if (
      extra.length > 0 ||
      !this.isCategory(category) ||
      !this.isPublicGender(gender) ||
      !buildingCode ||
      !this.isFloorCode(floorCode)
    ) {
      throw new BadRequestException({
        code: 'PUBLIC_ROOM_GROUP_INVALID',
        message: 'Public room group key is invalid.',
      });
    }

    return {
      category,
      gender,
      buildingCode: buildingCode.toUpperCase(),
      floorCode,
    };
  }

  private mapAvailabilityGroup(group: PublicRoomAvailabilityGroupRecord) {
    return {
      groupKey: this.groupKey(group),
      category: group.category,
      categoryLabel: CATEGORY_LABEL[group.category],
      gender: group.gender,
      genderLabel: GENDER_LABEL[group.gender],
      buildingCode: group.buildingCode,
      buildingName: group.buildingName,
      floorCode: group.floorCode,
      floorLabel: group.floorLabel || FLOOR_LABEL[group.floorCode],
      availableCount: group.availableCount,
      priceFromMonthly: group.priceFromMonthly,
      priceFromYearly: group.priceFromYearly,
      publicTitle: `${CATEGORY_LABEL[group.category]} ${GENDER_LABEL[group.gender]} - ${group.buildingName}`,
      ctaLabel: 'Tanya Ketersediaan',
    };
  }

  private buildAvailabilitySummary(groups: PublicRoomAvailabilityGroupRecord[]) {
    return {
      totalAvailable: groups.reduce((sum, group) => sum + group.availableCount, 0),
      byCategory: {
        rukost: this.sumBy(groups, (group) => group.category === 'rukost'),
        apartkost: this.sumBy(groups, (group) => group.category === 'apartkost'),
      },
      byGender: {
        male: this.sumBy(groups, (group) => group.gender === 'male'),
        female: this.sumBy(groups, (group) => group.gender === 'female'),
      },
    };
  }

  private sumBy(
    groups: PublicRoomAvailabilityGroupRecord[],
    predicate: (group: PublicRoomAvailabilityGroupRecord) => boolean,
  ) {
    return groups.reduce((sum, group) => (predicate(group) ? sum + group.availableCount : sum), 0);
  }

  private groupKey(group: Pick<PublicRoomAvailabilityGroupRecord, 'category' | 'gender' | 'buildingCode' | 'floorCode'>) {
    return `${group.category}-${group.gender}-${group.buildingCode}-${group.floorCode}`;
  }

  private isCategory(value: string | undefined): value is RoomCategory {
    return value === 'rukost' || value === 'apartkost';
  }

  private isPublicGender(value: string | undefined): value is PublicRoomGenderPolicy {
    return value === 'male' || value === 'female';
  }

  private isFloorCode(value: string | undefined): value is RoomFloorCode {
    return value === 'A' || value === 'B';
  }
}
