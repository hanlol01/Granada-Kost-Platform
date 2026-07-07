export type BookingLeadCategory = 'rukost' | 'apartkost';
export type BookingLeadGender = 'male' | 'female';
export type BookingLeadGenderInput = BookingLeadGender | 'putra' | 'putri';
export type BookingLeadFloorCode = 'A' | 'B';
export type BookingLeadStatus =
  | 'new'
  | 'contacted'
  | 'visit_scheduled'
  | 'converted'
  | 'rejected'
  | 'expired';
export type BookingLeadSource = 'public_kamar';

export type BookingLeadRecord = {
  id: string;
  propertyId: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode: string | null;
  floorCode: BookingLeadFloorCode | null;
  publicGroupKey: string | null;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string | null;
  preferredMoveInDate: string | null;
  status: BookingLeadStatus;
  source: BookingLeadSource;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBookingLeadInput = {
  propertyId: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode?: string;
  floorCode?: BookingLeadFloorCode;
  publicGroupKey?: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage?: string;
  preferredMoveInDate?: string;
  source: BookingLeadSource;
  metadata?: Record<string, unknown>;
};

export type PublicPropertyResolutionInput = {
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode?: string;
  floorCode?: BookingLeadFloorCode;
};

export type ListBookingLeadsFilters = {
  status?: BookingLeadStatus;
  category?: BookingLeadCategory;
  gender?: BookingLeadGender;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type BookingLeadRequestContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
