export const EXPENSE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'rejected',
  'cancelled',
  'reversed',
  'archived',
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'qris',
  'ewallet',
  'other',
] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export type ExpenseRecord = {
  id: string;
  propertyId: string;
  buildingId: string | null;
  workOrderId: string | null;
  proofFileId: string | null;
  category: string;
  expenseDate: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName: string | null;
  notes: string | null;
  status: ExpenseStatus;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  reversedAt: Date | null;
  rejectedAt?: Date | null;
  rejectReason?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseAuditContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type CreateExpenseInput = {
  propertyId: string;
  buildingId?: string;
  workOrderId?: string;
  proofFileId?: string;
  category: string;
  expenseDate: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName?: string;
  notes?: string;
  createdByUserId: string;
};
