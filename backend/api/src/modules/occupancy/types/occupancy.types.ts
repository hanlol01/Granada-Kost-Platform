export type OccupancyStatus = 'active' | 'ended' | 'cancelled';
export type CheckOutStatus = 'requested' | 'approved' | 'rejected' | 'finalized' | 'cancelled';

export type OccupancyRecord = {
  id: string;
  propertyId: string;
  roomId: string;
  residentId: string;
  startDate: string;
  endDate: string | null;
  occupancyStatus: OccupancyStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CheckInRecord = {
  id: string;
  propertyId: string;
  roomId: string;
  residentId: string;
  occupancyId: string | null;
  checkedInAt: Date;
  handledByUserId: string | null;
  notes: string | null;
};

export type CheckOutRequestRecord = {
  id: string;
  propertyId: string;
  occupancyId: string;
  roomId: string;
  residentId: string;
  requestedCheckOutDate: string;
  reason: string | null;
  checkOutStatus: CheckOutStatus;
  createdAt: Date;
  finalizedAt: Date | null;
};
