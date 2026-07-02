export type BillingPeriodStatus = 'open' | 'closed' | 'cancelled';
export type InvoiceStatus = 'draft' | 'issued' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export type InvoiceLineType = 'rent' | 'electricity' | 'water' | 'wifi' | 'late_fee' | 'adjustment' | 'other';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'qris' | 'ewallet' | 'other';
export type PaymentStatus = 'pending' | 'verified' | 'void';
export type PaymentAllocationStatus = 'active' | 'reversed';
export type PaymentProofStatus = 'pending_review' | 'verified' | 'rejected' | 'expired';
export type LateFeeAssessmentStatus = 'assessed' | 'applied' | 'waived' | 'reversed';

export type BillingPeriodRecord = {
  id: string;
  propertyId: string;
  periodKey: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  status: BillingPeriodStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  roomId: string;
  occupancyId: string;
  billingPeriodId: string;
  invoiceCode: string;
  invoiceStatus: InvoiceStatus;
  subtotalAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  dueDate: string;
  issuedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  snapshotPeriodKey: string;
  snapshotPeriodStartDate: string;
  snapshotPeriodEndDate: string;
  snapshotRoomNumber: string;
  snapshotResidentName: string;
  snapshotMonthlyPrice: number;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceLineItemRecord = {
  id: string;
  invoiceId: string;
  lineType: InvoiceLineType;
  description: string;
  quantity: string;
  unitAmount: number;
  totalAmount: number;
  sortOrder: number;
};

export type PaymentRecord = {
  id: string;
  propertyId: string;
  residentId: string | null;
  paymentCode: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amount: number;
  paidAt: Date | null;
  verifiedAt: Date | null;
  voidedAt: Date | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentAllocationRecord = {
  id: string;
  paymentId: string;
  targetType: 'invoice' | 'deposit' | 'other';
  targetId: string;
  invoiceId: string | null;
  allocatedAmount: number;
  allocationStatus: PaymentAllocationStatus;
  allocatedAt: Date;
};

export type PaymentProofRecord = {
  id: string;
  propertyId: string;
  residentId: string;
  invoiceId: string;
  paymentAccountId: string | null;
  proofStatus: PaymentProofStatus;
  claimedAmount: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  uploadedByUserId: string;
  uploadedAt: Date;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentProofFileRecord = {
  id: string;
  paymentProofId: string;
  fileId: string;
  uploadedByUserId: string | null;
  caption: string | null;
  createdAt: Date;
};

export type LateFeeAssessmentRecord = {
  id: string;
  propertyId: string;
  invoiceId: string;
  assessmentDate: string;
  daysOverdue: number;
  ratePercentPerDay: string;
  capPercent: string;
  subtotalBasisAmount: number;
  assessedAmount: number;
  appliedAmount: number;
  assessmentStatus: LateFeeAssessmentStatus;
  assessedAt: Date;
};

export type CreateInvoiceInput = {
  propertyId: string;
  residentId: string;
  roomId: string;
  occupancyId: string;
  billingPeriodId: string;
  invoiceCode: string;
  subtotalAmount: number;
  dueDate: string;
  snapshotPeriodKey: string;
  snapshotPeriodStartDate: string;
  snapshotPeriodEndDate: string;
  snapshotRoomNumber: string;
  snapshotResidentName: string;
  snapshotMonthlyPrice: number;
  createdByUserId?: string;
};

export type RecordPaymentInput = {
  propertyId: string;
  residentId?: string;
  paymentCode: string;
  paymentMethod: PaymentMethod;
  amount: number;
  paidAt?: Date;
  receivedByUserId?: string;
  referenceNumber?: string;
  notes?: string;
};

export type CreatePaymentProofInput = {
  propertyId: string;
  residentId: string;
  invoiceId: string;
  paymentAccountId?: string;
  claimedAmount: number;
  paymentMethod: PaymentMethod;
  uploadedByUserId: string;
  notes?: string;
  fileIds?: string[];
};

export type CreatePaymentProofFileInput = {
  paymentProofId: string;
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
