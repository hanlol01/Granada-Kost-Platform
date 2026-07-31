export type BookingLeadCategory = 'rukost' | 'apartkost';
export type BookingLeadGender = 'male' | 'female';
export type BookingLeadGenderInput = BookingLeadGender | 'putra' | 'putri';
export type BookingLeadFloorCode = 'A' | 'B';
export type BookingLeadStatus =
  | 'new'
  | 'contacted'
  | 'visit_scheduled'
  | 'negotiating'
  | 'awaiting_dp'
  | 'onboarding'
  | 'leased'
  | 'converted'
  | 'rejected'
  | 'expired'
  | 'cancelled';
export type BookingLeadSource = 'public_kamar' | 'admin_quick_entry';

export type BookingLeadRecord = {
  id: string;
  propertyId: string;
  roomId: string | null;
  roomNumber: string | null;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode: string | null;
  floorCode: BookingLeadFloorCode | null;
  publicGroupKey: string | null;
  visitorName: string;
  visitorEmail?: string | null;
  visitorPhone: string;
  visitorAddress: string | null;
  visitorUniversity: string | null;
  visitorMessage: string | null;
  preferredMoveInDate: string | null;
  status: BookingLeadStatus;
  source: BookingLeadSource;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminBookingLeadRoom = {
  id: string;
  propertyId: string;
  roomNumber: string;
  category: BookingLeadCategory | null;
  floorCode: BookingLeadFloorCode | null;
  roomStatus: string;
  genderPolicy: string;
  buildingId: string | null;
  buildingCode: string | null;
  buildingCategory: BookingLeadCategory | null;
  buildingGenderPolicy: string | null;
};

export type CreateAdminBookingLeadInput = {
  propertyId: string;
  roomId: string;
  roomNumber: string;
  category: BookingLeadCategory;
  gender: BookingLeadGender;
  buildingCode: string;
  floorCode: BookingLeadFloorCode | null;
  visitorName: string;
  visitorPhone: string;
  visitorAddress: string;
  visitorUniversity?: string;
  createdByUserId: string;
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
  visitorEmail?: string;
  visitorUniversity?: string;
  consent?: boolean;
  preferredMoveInDate?: string;
  source: BookingLeadSource;
  metadata?: Record<string, unknown>;
};

export type PublicPropertyResolutionInput = {
  category: BookingLeadCategory;
  gender: BookingLeadGender;
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

export type AdminBookingLeadPage = {
  data: BookingLeadRecord[];
  limit: number;
  offset: number;
  total: number;
};

export type BookingLeadStatusCommandClaim = {
  requestFingerprint: string;
  commandStatus: string;
  responseStatus: number | null;
  responseBody: Record<string, unknown> | null;
};

export type BookingLeadRequestContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  idempotencyKey?: string;
};
