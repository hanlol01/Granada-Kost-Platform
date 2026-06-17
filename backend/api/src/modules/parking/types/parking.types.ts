export type ParkingManagementMode = 'unmanaged' | 'zone' | 'slot';

export type ParkingZoneType = 'motorcycle' | 'car' | 'mixed';

export type ParkingSlotType = 'motorcycle' | 'car';

export type ParkingSlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

export type ParkingZoneRecord = {
  id: string;
  propertyId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: ParkingZoneType;
  capacity: number;
  locationDescription: string | null;
  isActive: boolean;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ParkingSlotRecord = {
  id: string;
  zoneId: string;
  slotNumber: string;
  slotType: ParkingSlotType;
  slotStatus: ParkingSlotStatus;
  vehicleId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ParkingCapacitySnapshot = {
  capacity: number;
  occupied: number;
  available: number;
  utilizationRate: number;
};

export type CreateParkingZoneInput = {
  propertyId: string;
  zoneCode: string;
  zoneName: string;
  zoneType: ParkingZoneType;
  capacity?: number;
  locationDescription?: string;
  sortOrder?: number;
  createdByUserId?: string;
};

export type CreateParkingSlotInput = {
  zoneId: string;
  slotNumber: string;
  slotType: ParkingSlotType;
};

export type AuditActorContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
