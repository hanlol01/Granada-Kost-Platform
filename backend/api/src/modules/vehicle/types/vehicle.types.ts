export type VehicleType = 'motorcycle' | 'car' | 'bicycle' | 'electric_scooter' | 'other';

export type VehicleStatus =
  | 'pending_approval'
  | 'active'
  | 'rejected'
  | 'suspended'
  | 'transfer_pending'
  | 'inactive';

export type VehicleFilePurpose = 'vehicle_photo' | 'stnk' | 'other';

export type VehicleRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: VehicleType;
  brand: string;
  color: string;
  year: string | null;
  vehicleStatus: VehicleStatus;
  notes: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectReason: string | null;
  suspendReason: string | null;
  deactivationReason: string | null;
  deactivatedAt: Date | null;
  snapshotResidentName: string;
  snapshotRoomNumber: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type VehicleStatusHistoryRecord = {
  id: string;
  vehicleId: string;
  fromStatus: VehicleStatus | null;
  toStatus: VehicleStatus;
  changedByUserId: string | null;
  changedAt: Date;
  notes: string | null;
};

export type VehicleFileRecord = {
  id: string;
  vehicleId: string;
  fileId: string;
  filePurpose: VehicleFilePurpose;
  uploadedByUserId: string | null;
  caption: string | null;
  createdAt: Date;
};

export type VehicleSettingsRecord = {
  propertyId: string;
  parkingManagementMode: 'unmanaged' | 'zone' | 'slot';
  maxVehiclesPerResident: number;
  parkingCapacityMotorcycle: number | null;
  parkingCapacityCar: number | null;
  parkingRequiresApproval: boolean;
};

export type VehicleSummaryRecord = {
  activeCount: number;
  motorcycleCount: number;
  carCount: number;
  pendingCount: number;
  totalRegistered: number;
};

export type ActiveResidentVehicleContext = {
  propertyId: string;
  residentId: string;
  roomId: string;
  roomNumber: string;
  residentName: string;
};

export type CreateVehicleInput = {
  propertyId: string;
  residentId: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: VehicleType;
  brand: string;
  color: string;
  year?: string;
  vehicleStatus: VehicleStatus;
  notes?: string;
  approvedByUserId?: string;
  snapshotResidentName: string;
  snapshotRoomNumber?: string;
  createdByUserId: string;
};

export type UpdateVehicleInput = {
  plateNumber?: string;
  vehicleType?: VehicleType;
  brand?: string;
  color?: string;
  year?: string | null;
  notes?: string | null;
};

export type VehicleStatusTransitionInput = {
  vehicleId: string;
  fromStatus: VehicleStatus | null;
  toStatus: VehicleStatus;
  actorUserId?: string;
  notes?: string;
};

export type CreateVehicleFileInput = {
  vehicleId: string;
  fileId: string;
  filePurpose?: VehicleFilePurpose;
  uploadedByUserId?: string;
  caption?: string;
};

export type AuditActorContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
