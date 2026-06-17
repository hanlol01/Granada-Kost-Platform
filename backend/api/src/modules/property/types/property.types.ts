export type PropertyStatus = 'active' | 'inactive';

export type PropertyRecord = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: PropertyStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PropertySettingsRecord = {
  propertyId: string;
  defaultDueDay: number;
  lateFeePercentPerDay: string;
  bookingFeeAmount: number;
  quietHourStart: string | null;
  guestReportDeadline: string | null;
};

export type RequestAuditContext = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
