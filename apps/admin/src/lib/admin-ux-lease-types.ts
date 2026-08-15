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
  genderPolicy: "male" | "female" | "mixed";
  roomStatus: "vacant";
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

export type TransferPath = "end_period" | "same_day_exception";

export const TRANSFER_REASON_CODES = [
  "resident_request",
  "room_issue",
  "property_operation",
  "eligibility_correction",
  "commercial_adjustment",
  "other",
] as const;

export type TransferReasonCode = (typeof TRANSFER_REASON_CODES)[number];

export type TransferPreview = {
  transferPath: TransferPath;
  effectiveDate: string;
  validEffectiveDates: string[];
  sourceLease: TransferLeaseSnapshot;
  targetRoom: {
    id: string;
    number: string;
    kostType: { id: string; name: string };
    genderCompatible: boolean;
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
    contractualEndDate: string | null;
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
    transferCommandId: string | null;
    transferPath: TransferPath;
    reasonCode: TransferReasonCode;
    executedLate: boolean;
  };
  deposit: DepositSummary;
  targetInvoice: TransferTargetInvoice | null;
  oldOutstandingAmount: number;
};

export type TransferCommandState = "scheduled" | "executed" | "cancelled" | "failed";

/** W07C server-projected renewal command. Commercial values are snapshots. */
export type RenewalCommandState = "draft" | "approved" | "activated" | "cancelled" | "failed";

export type RenewalCommand = {
  id: string;
  predecessorLeaseId: string;
  successorLeaseId: string | null;
  effectiveDate: string;
  state: RenewalCommandState;
  termMonths: number | null;
  billingCycle: BillingCycle | null;
  paymentPlanType: "annual_full" | "two_month_installments" | "monthly_installments" | null;
  contractRentAmount: number | null;
  /** Informational prefill only. The server never treats this as a payment minimum. */
  dpRecommendedAmount: number | null;
  firstInvoiceId: string | null;
  financialPreparedAt: string | null;
  activationAuthorizedAt: string | null;
  activatedAt: string | null;
  cancelReason: string | null;
  failureCode: string | null;
  createdAt: string;
};

/**
 * W07C query-derived, read-only lease-ending renewal eligibility. Mirrors the
 * server projection consumed by the H-60/H-30/H-14 reminder authority. It is
 * never a delivery record and never mutates state.
 */
export type RenewalReminderFact = {
  windowOpen: boolean;
  cleared: boolean;
  actionRequired: boolean;
};

export type RenewalEligibility = {
  leaseId: string;
  propertyId: string;
  leaseStatus: string;
  leaseEndDate: string | null;
  asOfDate: string;
  daysUntilEnding: number | null;
  renewalCommandId: string | null;
  renewalState: RenewalCommandState | null;
  reminders: {
    h60: RenewalReminderFact;
    h30: RenewalReminderFact & {
      unresolvedWork:
        | "financial_preparation"
        | "activation_authorization"
        | "activation_execution"
        | null;
      paymentRecorded: boolean;
    };
    h14: RenewalReminderFact;
  };
};

export type TransferCommand = {
  id: string;
  transferPath: TransferPath;
  effectiveDate: string;
  fromRoomId: string;
  toRoomId: string;
  state: TransferCommandState;
  reasonCode: TransferReasonCode;
  reasonDetail: string | null;
  exceptionReason: string | null;
  failureCode: string | null;
  cancelReason: string | null;
  transferRecordId: string | null;
  executedLate: boolean;
  sourceEndDate: string | null;
  createdAt: string;
  executedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
};
