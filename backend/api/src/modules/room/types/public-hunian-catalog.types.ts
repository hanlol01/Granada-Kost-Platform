import type { HunianGalleryPublicResponse } from '../../hunian-gallery/types/hunian-gallery.types';
import { PublicRoomGenderPolicy, RoomCategory } from './room.types';

export type PublicHunianCatalogGalleryItem = Omit<HunianGalleryPublicResponse, 'id'>;

export type PublicHunianCatalogFaqItem = {
  question: string;
  answer: string;
};

export type PublicHunianCatalogBookingLeadDefaults = {
  category: RoomCategory;
};

export type PublicHunianCatalogGenderAvailability = {
  gender: PublicRoomGenderPolicy;
  genderLabel: string;
  availabilityCount: number;
};

export type PublicHunianCatalogListItem = {
  slug: string;
  title: string;
  category: RoomCategory;
  categoryLabel: string;
  shortDescription: string;
  priceFromMonthly: number | null;
  priceFromYearly: number | null;
  availabilityCount: number;
  facilitiesPreview: string[];
  galleryPreview: PublicHunianCatalogGalleryItem[];
  ctaLabel: string;
  bookingLeadDefaults: PublicHunianCatalogBookingLeadDefaults;
  disclaimers: string[];
  leaseMinimumMonths: number;
  paymentSchedules: string[];
  dpMinimumPercent: number;
  securityDepositMonths: number;
  genderAvailability: PublicHunianCatalogGenderAvailability[];
};

export type PublicHunianCatalogDetailItem = PublicHunianCatalogListItem & {
  longDescription: string;
  facilities: string[];
  pricingExplanation: string;
  minimumLeaseTerm: string;
  dpExplanation: string;
  securityDepositExplanation: string;
  manualPaymentMethods: string[];
  houseRules: string[];
  visitorHours: string | null;
  contactInformation: string;
  gallery: PublicHunianCatalogGalleryItem[];
};
