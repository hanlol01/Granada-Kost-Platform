import { ComplaintPriority } from '../../complaint/types/complaint.types';

export type WorkOrderPriority = ComplaintPriority;

export type WorkOrderStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'verified'
  | 'rework_required'
  | 'cancelled';

export type StoredWorkOrderStatus = WorkOrderStatus;

export type TechnicianProfileRecord = {
  id: string;
  propertyId: string;
  userId: string;
  displayName: string;
  phone: string | null;
  skillTags: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkOrderRecord = {
  id: string;
  propertyId: string;
  roomId: string | null;
  complaintId: string | null;
  workOrderCode: string;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  workOrderStatus: StoredWorkOrderStatus;
  assignedToUserId: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  reworkReason: string | null;
  cancelReason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkOrderHistoryRecord = {
  id: string;
  workOrderId: string;
  fromStatus: StoredWorkOrderStatus | null;
  toStatus: StoredWorkOrderStatus;
  changedByUserId: string | null;
  changedAt: Date;
  notes: string | null;
};

export type WorkOrderFileRecord = {
  id: string;
  workOrderId: string;
  fileId: string;
  uploadedByUserId: string | null;
  caption: string | null;
  createdAt: Date;
};

export type MaintenanceMaterialRecord = {
  id: string;
  workOrderId: string;
  itemName: string;
  quantity: string;
  unitCost: number;
  totalCost: number;
  createdByUserId: string | null;
  createdAt: Date;
};

export type CreateTechnicianProfileInput = {
  propertyId: string;
  userId: string;
  displayName: string;
  phone?: string;
  skillTags?: string;
};

export type CreateWorkOrderInput = {
  propertyId: string;
  roomId?: string;
  complaintId?: string;
  workOrderCode: string;
  title: string;
  description?: string;
  priority: WorkOrderPriority;
  scheduledAt?: Date;
  createdByUserId: string;
};

export type WorkOrderStatusTransitionInput = {
  workOrderId: string;
  fromStatus: StoredWorkOrderStatus;
  toStatus: StoredWorkOrderStatus;
  actorUserId?: string;
  notes?: string;
};

export type CreateWorkOrderFileInput = {
  workOrderId: string;
  fileId: string;
  uploadedByUserId?: string;
  caption?: string;
};

export type CreateMaintenanceMaterialInput = {
  workOrderId: string;
  itemName: string;
  quantity?: string;
  unitCost?: number;
  totalCost?: number;
  createdByUserId?: string;
};

export type AuditActorContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};
