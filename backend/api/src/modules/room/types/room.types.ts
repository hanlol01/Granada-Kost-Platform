export type RoomStatus = 'vacant' | 'reserved' | 'occupied' | 'maintenance' | 'inactive' | 'requires_review';
export type MasterStatus = 'active' | 'inactive';
export type RoomGenderPolicy = 'male' | 'female' | 'mixed';
export type RoomCategory = 'rukost' | 'apartkost';
export type RoomFloorCode = 'A' | 'B';

export type RoomTypeRecord = {
  id: string;
  propertyId: string;
  name: string;
  basePrice: number;
  defaultDepositAmount: number;
  description: string | null;
  status: MasterStatus;
};

export type RoomFacilityRecord = {
  id: string;
  propertyId: string;
  name: string;
  status: MasterStatus;
};

export type RoomRecord = {
  id: string;
  propertyId: string;
  roomTypeId: string | null;
  number: string;
  unitCode: string | null;
  genderPolicy: RoomGenderPolicy;
  floor: string | null;
  sizeLabel: string | null;
  monthlyPrice: number;
  depositAmount: number;
  roomStatus: RoomStatus;
  primaryPhotoFileId: string | null;
  roomCode: string | null;
  category: RoomCategory | null;
  buildingId: string | null;
  buildingCode: string | null;
  buildingName: string | null;
  floorCode: RoomFloorCode | null;
  floorLabel: string | null;
  publicVisible: boolean;
  yearlyPrice: number | null;
  facilities: RoomFacilityRecord[];
};
