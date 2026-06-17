export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ComplaintStatus =
  | 'submitted'
  | 'acknowledged'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'escalated'
  | 'resolved'
  | 'reopened'
  | 'closed'
  | 'cancelled';

export type StoredComplaintStatus = Exclude<ComplaintStatus, 'assigned'>;

export type ComplaintCategoryRecord = {
  id: string;
  propertyId: string;
  name: string;
  normalizedCode: string;
  defaultPriority: ComplaintPriority;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  sortOrder: number;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplaintRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string | null;
  categoryId: string;
  complaintCode: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  complaintStatus: StoredComplaintStatus;
  reopenCount: number;
  responseSlaBreached: boolean;
  resolutionSlaBreached: boolean;
  locationNote: string | null;
  assignedToUserId: string | null;
  submittedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  snapshotRoomNumber: string | null;
  snapshotResidentName: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ComplaintHistoryRecord = {
  id: string;
  complaintId: string;
  fromStatus: StoredComplaintStatus | null;
  toStatus: StoredComplaintStatus;
  label: string | null;
  changedByUserId: string | null;
  changedAt: Date;
  notes: string | null;
};

export type ComplaintFileRecord = {
  id: string;
  complaintId: string;
  fileId: string;
  uploadedByUserId: string | null;
  caption: string | null;
  createdAt: Date;
};

export type ActiveResidentComplaintContext = {
  propertyId: string;
  residentId: string;
  roomId: string;
  roomNumber: string;
  residentName: string;
};

export type ComplaintSummaryRecord = {
  openCount: number;
  closedCount: number;
  cancelledCount: number;
  slaBreachedCount: number;
  totalCount: number;
  avgResolutionHours: number | null;
};

export type CreateComplaintCategoryInput = {
  propertyId: string;
  name: string;
  normalizedCode: string;
  defaultPriority: ComplaintPriority;
  description?: string;
  icon?: string;
  sortOrder?: number;
  createdByUserId?: string;
};

export type CreateComplaintInput = {
  propertyId: string;
  residentId: string;
  roomId?: string;
  categoryId: string;
  complaintCode: string;
  title: string;
  description: string;
  priority: ComplaintPriority;
  locationNote?: string;
  snapshotRoomNumber?: string;
  snapshotResidentName: string;
  createdByUserId: string;
};

export type ComplaintStatusTransitionInput = {
  complaintId: string;
  fromStatus: StoredComplaintStatus;
  toStatus: StoredComplaintStatus;
  actorUserId?: string;
  label?: string;
  notes?: string;
};

export type CreateComplaintFileInput = {
  complaintId: string;
  fileId: string;
  uploadedByUserId?: string;
  caption?: string;
};

export type AuditActorContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
