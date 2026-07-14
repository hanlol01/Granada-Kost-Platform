export type LeaseStatus = "active" | "ended" | "cancelled" | "transferred";
export type BillingCycle = "monthly" | "yearly";
export type DepositTransactionType =
  | "collection"
  | "carry_forward"
  | "top_up"
  | "deduction"
  | "refund";
export type DepositDirection = "credit" | "debit";
export type RefundSettlementStatus = "pending" | "settled" | "waived";
export type PaymentMethod = "cash" | "bank_transfer" | "qris" | "ewallet" | "other";

export type LeaseSummary = {
  id: string;
  propertyId: string;
  leaseCode: string;
  leaseStatus: LeaseStatus;
  startDate: string;
  endDate: string | null;
  billingCycle: BillingCycle;
  billingAnchorDay: number;
  nextBillingDate: string;
  resident: {
    id: string;
    fullNameMasked: string;
  };
  room: {
    id: string;
    number: string;
  };
  kostType: {
    id: string;
    name: string;
  };
  lastInvoice: {
    id: string;
    invoiceCode: string;
    invoiceStatus: string;
    dueDate: string;
    totalAmount: number;
  } | null;
  outstandingAmount: number;
};

export type LeaseDetail = LeaseSummary & {
  snapshot: {
    monthlyPrice: number;
    yearlyPrice: number;
    depositAmount: number;
    roomNumber: string;
    kostTypeName: string;
  };
  resident: LeaseSummary["resident"];
};

export type LeaseInvoice = {
  id: string;
  invoiceCode: string;
  invoiceStatus: string;
  cycleStartDate: string;
  cycleEndDate: string;
  dueDate: string;
  totalAmount: number;
  outstandingAmount: number;
};

export type DepositSummary = {
  requiredAmount: number;
  collectedAmount: number;
  deductionAmount: number;
  refundedAmount: number;
  balanceAmount: number;
};

export type DepositLedgerEntry = {
  id: string;
  transactionType: DepositTransactionType;
  direction: DepositDirection;
  amount: number;
  reasonType: string | null;
  reason: string | null;
  settlementStatus: RefundSettlementStatus;
  createdAt: string;
};

export type LeaseHistoryEntry = {
  id: string;
  eventType: string;
  eventDate: string;
  createdAt: string;
};

export type LeaseDetailResponse = {
  lease: LeaseDetail;
  depositSummary: DepositSummary;
  depositLedger: DepositLedgerEntry[];
  invoices: LeaseInvoice[];
  history: LeaseHistoryEntry[];
  kostTypeFacilities: { id: string; name: string }[];
};

export type LeaseBillingSummary = {
  leaseId: string;
  invoices: LeaseInvoice[];
  totalAmount: number;
  outstandingAmount: number;
};

export type LeaseResidentOption = {
  id: string;
  displayNameMasked: string;
  residentStatus: "active" | "inactive";
};

export type LeaseRoomOption = {
  id: string;
  number: string;
  buildingName?: string | null;
  buildingCode?: string | null;
  unitCode?: string | null;
  floorLabel?: string | null;
  floor?: string | null;
  kostType: {
    id: string;
    name: string;
    category: "rukost" | "apartkost";
    monthlyPrice: number;
    yearlyPrice: number;
    depositAmount: number;
  };
};

export type TransferLeaseSnapshot = {
  id: string;
  propertyId: string;
  leaseCode: string;
  leaseStatus: LeaseStatus;
  startDate: string;
  endDate: string | null;
  billingCycle: BillingCycle;
  billingAnchorDay: number;
  nextBillingDate: string;
  room: { id: string; number: string };
  kostType: { id: string; name: string };
  snapshot: {
    monthlyPrice: number;
    yearlyPrice: number;
    depositAmount: number;
  };
};

export type TransferPreview = {
  effectiveDate: string;
  sourceLease: TransferLeaseSnapshot;
  targetRoom: {
    id: string;
    number: string;
    kostType: { id: string; name: string };
  };
  deposit: {
    carriedAmount: number;
    targetRequiredAmount: number;
    topUpRequiredAmount: number;
  };
  billing: {
    billingCycle: BillingCycle;
    billingAnchorDay: number;
    sourceNextBillingDate: string;
    targetInvoiceWillBeIssued: boolean;
    targetNextBillingDate: string;
    dueDay: number;
  };
  oldOutstandingAmount: number;
};

export type TransferTargetInvoice = {
  id: string;
  invoiceCode: string;
  dueDate: string;
  totalAmount: number;
};

export type TransferResult = {
  sourceLease: TransferPreview["sourceLease"];
  targetLease: TransferPreview["sourceLease"];
  transferRecord: {
    id: string;
    effectiveDate: string;
    fromRoomId: string;
    toRoomId: string;
    carriedDepositAmount: number;
    requiredTargetDepositAmount: number;
    topUpAmount: number;
  };
  deposit: DepositSummary;
  targetInvoice: TransferTargetInvoice | null;
  oldOutstandingAmount: number;
};
