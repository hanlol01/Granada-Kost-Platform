export type BookingLeadHoldStatus = 'active' | 'released' | 'expired';

export type BookingLeadHoldRecord = {
  id: string;
  propertyId: string;
  bookingLeadId: string;
  roomId: string;
  holdStatus: BookingLeadHoldStatus;
  startsAt: string;
  expiresAt: string;
  releasedAt: string | null;
};

export type BookingLeadHoldResponse = {
  id: string;
  property_id: string;
  booking_lead_id: string;
  room_id: string;
  hold_status: BookingLeadHoldStatus;
  starts_at: string;
  expires_at: string;
  released_at: string | null;
};

export type BookingLeadHoldRequestContext = {
  actorUserId: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type BookingLeadHoldCommandResult = {
  status: number;
  body: Record<string, unknown>;
  replayed: boolean;
};

export type BookingLeadHoldLockedLead = {
  id: string;
  propertyId: string;
  roomId: string | null;
  category: string;
  gender: 'male' | 'female';
  source: 'public_kamar' | 'admin_quick_entry';
  status: string;
};

export type BookingLeadHoldLockedRoom = {
  id: string;
  propertyId: string;
  category: string | null;
  roomStatus: string;
  buildingId: string | null;
  buildingPropertyId: string | null;
  buildingCategory: string | null;
  genderPolicy: 'male' | 'female' | 'mixed' | null;
};

export type BookingLeadHoldLockedMatch = BookingLeadHoldRecord & {
  stale: boolean;
};
