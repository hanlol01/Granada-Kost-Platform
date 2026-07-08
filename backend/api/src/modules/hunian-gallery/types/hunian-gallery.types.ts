import type { FileRecord } from '../../file/types/file.types';

export type HunianGalleryCategory = 'rukost' | 'apartkost';
export type HunianGalleryGender = 'male' | 'female';
export type HunianGalleryFloorCode = 'A' | 'B';

export type HunianGalleryRecord = {
  id: string;
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
  isCover: boolean;
  publicVisible: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HunianGalleryFileRecord = {
  gallery: HunianGalleryRecord;
  file: FileRecord;
};

export type HunianCatalogTarget = {
  propertyId: string;
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string;
  buildingName: string;
  floorCode: HunianGalleryFloorCode;
  floorLabel: string;
};

export type HunianGalleryAdminResponse = {
  id: string;
  catalogSlug: string;
  publicGroupKey: string;
  category: HunianGalleryCategory;
  gender: HunianGalleryGender;
  buildingCode: string | null;
  floorCode: HunianGalleryFloorCode | null;
  fileId: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  publicVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HunianGalleryPublicResponse = {
  id: string;
  contentUrl: string;
  thumbnailUrl: string | null;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
};
