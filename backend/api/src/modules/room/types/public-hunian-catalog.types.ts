import { PublicRoomGenderPolicy, RoomCategory, RoomFloorCode } from './room.types';

export type PublicHunianCatalogGalleryItem = {
  url: string;
  alt: string;
  order: number;
};

export type PublicHunianCatalogFaqItem = {
  question: string;
  answer: string;
};

export type PublicHunianCatalogBookingLeadDefaults = {
  category: RoomCategory;
  gender: PublicRoomGenderPolicy;
  buildingCode: string;
  floorCode: RoomFloorCode | null;
  publicGroupKey: string;
};

export type PublicHunianCatalogListItem = {
  slug: string;
  title: string;
  category: RoomCategory;
  categoryLabel: string;
  gender: PublicRoomGenderPolicy;
  genderLabel: string;
  buildingCode: string;
  buildingName: string;
  floorCode: RoomFloorCode | null;
  floorLabel: string | null;
  publicGroupKey: string;
  shortDescription: string;
  priceFromMonthly: number | null;
  priceFromYearly: number | null;
  availabilityCount: number;
  facilitiesPreview: string[];
  galleryPreview: PublicHunianCatalogGalleryItem[];
  ctaLabel: string;
  bookingLeadDefaults: PublicHunianCatalogBookingLeadDefaults;
  disclaimers: string[];
};

export type PublicHunianCatalogDetailItem = PublicHunianCatalogListItem & {
  longDescription: string;
  facilitiesRoom: string[];
  facilitiesBathroom: string[];
  facilitiesShared: string[];
  facilitiesSecurity: string[];
  facilitiesService: string[];
  policies: string[];
  rules: string[];
  faq: PublicHunianCatalogFaqItem[];
  gallery: PublicHunianCatalogGalleryItem[];
  needsConfirmation: string[];
};
