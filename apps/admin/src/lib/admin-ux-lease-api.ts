// Typed, property-scoped client for the M5/M6 lease lifecycle contract.
// Lifecycle commands always wait for a server response and receive the
// Idempotency-Key owned by the submitting UI intent.
import { adminUxV2Requester, type AdminUxQueryValue } from "./admin-ux-api";
import { getAccessToken } from "./api";
import { fetchPreviewAndDownload } from "./document-download";
import { env } from "./env";
import { mapV2Data, mapV2Page, type V2DataEnvelope, type V2ListEnvelope } from "./admin-ux-mapper";
import type {
  BillingCycle,
  DepositLedgerEntry,
  LeaseBillingSummary,
  LeaseDetailResponse,
  LeaseRoomOption,
  LeaseStatus,
  LeaseSummary,
  PaymentMethod,
  TransferCommand,
  TransferPath,
  TransferPreview,
  TransferReasonCode,
  TransferResult,
  LeaseResidentOption,
  RenewalCommand,
  RenewalEligibility,
  CheckoutCommand,
  CheckoutSettlementQuote,
} from "./admin-ux-lease-types";

export type LeasePageInput = { propertyId: string; limit?: number; offset?: number };

export type LeaseListInput = LeasePageInput & {
  status?: LeaseStatus;
  residentId?: string;
  roomId?: string;
  kostTypeId?: string;
  q?: string;
};

export type LeaseCreateInput = {
  propertyId: string;
  roomId: string;
  residentId?: string;
  resident?: { fullName: string };
  startDate: string;
  billingCycle: BillingCycle;
  billingAnchorDay?: number;
  notes?: string;
};

export type LeaseCloseInput = {
  endDate: string;
  roomStatusAfter: "vacant" | "maintenance";
  reason: string;
  damageDeductions?: { amount: number; reason: string }[];
  refund?: { amount?: number; reason?: string };
};

export type CheckoutNoticeInput = {
  exitType: "resident_early_termination" | "normal_expiry";
  effectiveDate: string;
  reason: string;
  noticeExceptionReason?: string;
};
export type CheckoutApprovalInput = {
  approvedShortNoticeCharge: number;
  shortNoticeWaiverReason?: string;
};
export type CheckoutHandoverInput = {
  keyAccessConfirmed: boolean;
  inventoryConfirmed: boolean;
  parkingConfirmed: boolean;
  inventoryItems: Array<{
    name: string;
    expectedQuantity: number;
    returnedQuantity: number;
    condition: "complete" | "partial" | "damaged" | "missing" | "not_applicable";
    notes?: string;
  }>;
  keyAccessItems: Array<{
    name: string;
    expectedQuantity: number;
    returnedQuantity: number;
    status: "returned" | "partial" | "damaged" | "missing" | "not_applicable";
    notes?: string;
  }>;
  utilityReadings?: Array<{
    utilityType: string;
    meterNumber?: string;
    checkoutReading: string;
    unit: string;
    outstandingUsageNotes?: string;
  }>;
  keyAccessFileIds?: string[];
  inventoryFileIds?: string[];
  parkingFileIds?: string[];
  notes?: string;
};
export type CheckoutInspectionInput = {
  roomStatusAfter: "inspection_required" | "maintenance";
  inspectionFileIds?: string[];
  notes?: string;
};
export type CheckoutCompleteInput = {
  roomStatusAfter: "inspection_required" | "maintenance";
  damageDeductions?: { amount: number; reason: string; evidenceFileIds: string[] }[];
  depositRentOffsetAmount?: number;
  depositRentOffsetReason?: string;
  depositRentOffsetEvidenceFileIds?: string[];
  finalRefundAmount?: number;
  refundAdjustmentReason?: string;
  refundAdjustmentEvidenceFileIds?: string[];
  refundReason?: string;
};

export type CheckoutRefundSettlementInput = {
  paymentMethod: "cash" | "bank_transfer" | "qris" | "ewallet" | "other";
  externalReference: string;
  evidenceFileIds: string[];
  notes?: string;
};

export async function downloadLeaseExitDocument(
  leaseId: string,
  commandId: string,
  documentId: string,
  documentCode: string,
) {
  const filename = `${documentCode.replace(/[^a-z0-9_-]+/gi, "-") || "dokumen-checkout"}.pdf`;
  await fetchPreviewAndDownload(async () => {
    const token = getAccessToken();
    const response = await fetch(
      `${env.VITE_API_BASE_URL}/leases/${encodeURIComponent(leaseId)}/checkout/${encodeURIComponent(commandId)}/documents/${encodeURIComponent(documentId)}/document`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/pdf")
      throw new Error(`Dokumen checkout gagal diunduh (HTTP ${response.status}).`);
    return response;
  }, filename);
}

export type DepositCollectInput = {
  transactionType: "collection" | "top_up";
  amount: number;
  payment: { paymentMethod: PaymentMethod; paymentCode?: string; referenceNumber?: string };
  overrideReason?: string;
};

export type TransferPreviewInput = {
  targetRoomId: string;
  effectiveDate?: string;
  transferPath?: TransferPath;
};

/** W07B decision 4: fixed reason taxonomy; same-day exceptions need a reason. */
export type TransferReasonFields = {
  reasonCode: TransferReasonCode;
  reasonDetail?: string;
};

export type TransferInput = Omit<TransferPreviewInput, "effectiveDate"> &
  TransferReasonFields & {
    effectiveDate: string;
    exceptionReason: string;
    topUp?: {
      amount: number;
      payment: { paymentMethod: PaymentMethod; paymentCode?: string; referenceNumber?: string };
    };
  };

/** W07B normal path: no top-up and no immediate lifecycle change. */
export type TransferScheduleInput = Omit<TransferPreviewInput, "effectiveDate" | "transferPath"> &
  TransferReasonFields & { effectiveDate: string };

export type RefundSettlementInput = {
  paymentMethod: PaymentMethod;
  externalReference: string;
  notes?: string;
};

export type RenewalIntentInput = { effectiveDate: string; note?: string };
export type RenewalApprovalInput = {
  termMonths: number;
  billingCycle: BillingCycle;
  paymentPlanType: "annual_full" | "two_month_installments" | "monthly_installments";
};

export type LeaseCreateResult = {
  lease: LeaseDetailResponse["lease"];
  occupancy: { id: string; occupancyStatus: "active"; startDate: string };
  firstInvoice: {
    id: string;
    invoiceCode: string;
    invoiceStatus: string;
    dueDate: string;
    totalAmount: number;
  };
  depositSummary: LeaseDetailResponse["depositSummary"];
};

export type LeaseCloseResult = {
  lease: LeaseDetailResponse["lease"];
  room: { id: string; roomStatus: "vacant" | "maintenance" };
  depositSummary: LeaseDetailResponse["depositSummary"];
  deductions: DepositLedgerEntry[];
  refund: DepositLedgerEntry | null;
  outstandingAmountBeforeDeduction: number;
};

function pageQuery(input: LeasePageInput): Record<string, AdminUxQueryValue> {
  return { property_id: input.propertyId, limit: input.limit, offset: input.offset };
}

function text(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

async function data<T>(request: Promise<V2DataEnvelope<unknown>>): Promise<T> {
  return mapV2Data<T>(await request);
}

/**
 * The detail response is intentionally narrowed before React Query receives it.
 * Free-form notes, ledger reasons, and history metadata are not needed by M6
 * screens and could otherwise carry sensitive data from an older record.
 */
export function sanitizeLeaseDetailResponse(value: LeaseDetailResponse): LeaseDetailResponse {
  const lease = value.lease;
  return {
    lease: {
      id: lease.id,
      propertyId: lease.propertyId,
      leaseCode: lease.leaseCode,
      leaseStatus: lease.leaseStatus,
      startDate: lease.startDate,
      endDate: lease.endDate,
      billingCycle: lease.billingCycle,
      billingAnchorDay: lease.billingAnchorDay,
      nextBillingDate: lease.nextBillingDate,
      resident: {
        id: lease.resident.id,
        fullNameMasked: lease.resident.fullNameMasked,
      },
      room: { id: lease.room.id, number: lease.room.number },
      kostType: { id: lease.kostType.id, name: lease.kostType.name },
      lastInvoice: lease.lastInvoice
        ? {
            id: lease.lastInvoice.id,
            invoiceCode: lease.lastInvoice.invoiceCode,
            invoiceStatus: lease.lastInvoice.invoiceStatus,
            dueDate: lease.lastInvoice.dueDate,
            totalAmount: lease.lastInvoice.totalAmount,
          }
        : null,
      outstandingAmount: lease.outstandingAmount,
      snapshot: {
        monthlyPrice: lease.snapshot.monthlyPrice,
        yearlyPrice: lease.snapshot.yearlyPrice,
        depositAmount: lease.snapshot.depositAmount,
        roomNumber: lease.snapshot.roomNumber,
        kostTypeName: lease.snapshot.kostTypeName,
      },
    },
    depositSummary: { ...value.depositSummary },
    depositLedger: value.depositLedger.map((entry) => ({
      id: entry.id,
      transactionType: entry.transactionType,
      direction: entry.direction,
      amount: entry.amount,
      reasonType: entry.reasonType,
      reason: null,
      settlementStatus: entry.settlementStatus,
      createdAt: entry.createdAt,
    })),
    invoices: value.invoices.map((invoice) => ({ ...invoice })),
    history: value.history.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      eventDate: entry.eventDate,
      createdAt: entry.createdAt,
    })),
    kostTypeFacilities: value.kostTypeFacilities.map((facility) => ({ ...facility })),
  };
}

function sanitizeTransferLease(
  lease: TransferResult["sourceLease"],
): TransferResult["sourceLease"] {
  return {
    id: lease.id,
    propertyId: lease.propertyId,
    leaseCode: lease.leaseCode,
    leaseStatus: lease.leaseStatus,
    startDate: lease.startDate,
    endDate: lease.endDate,
    billingCycle: lease.billingCycle,
    billingAnchorDay: lease.billingAnchorDay,
    nextBillingDate: lease.nextBillingDate,
    room: { id: lease.room.id, number: lease.room.number },
    kostType: { id: lease.kostType.id, name: lease.kostType.name },
    snapshot: {
      monthlyPrice: lease.snapshot.monthlyPrice,
      yearlyPrice: lease.snapshot.yearlyPrice,
      depositAmount: lease.snapshot.depositAmount,
    },
  };
}

export function sanitizeTransferResult(value: TransferResult): TransferResult {
  return {
    sourceLease: sanitizeTransferLease(value.sourceLease),
    targetLease: sanitizeTransferLease(value.targetLease),
    transferRecord: {
      id: value.transferRecord.id,
      effectiveDate: value.transferRecord.effectiveDate,
      fromRoomId: value.transferRecord.fromRoomId,
      toRoomId: value.transferRecord.toRoomId,
      carriedDepositAmount: value.transferRecord.carriedDepositAmount,
      requiredTargetDepositAmount: value.transferRecord.requiredTargetDepositAmount,
      topUpAmount: value.transferRecord.topUpAmount,
      transferCommandId: value.transferRecord.transferCommandId ?? null,
      transferPath: value.transferRecord.transferPath ?? "same_day_exception",
      reasonCode: value.transferRecord.reasonCode ?? "other",
      executedLate: value.transferRecord.executedLate ?? false,
    },
    deposit: {
      requiredAmount: value.deposit.requiredAmount,
      collectedAmount: value.deposit.collectedAmount,
      deductionAmount: value.deposit.deductionAmount,
      refundedAmount: value.deposit.refundedAmount,
      balanceAmount: value.deposit.balanceAmount,
    },
    targetInvoice: value.targetInvoice
      ? {
          id: value.targetInvoice.id,
          invoiceCode: value.targetInvoice.invoiceCode,
          dueDate: value.targetInvoice.dueDate,
          totalAmount: value.targetInvoice.totalAmount,
        }
      : null,
    oldOutstandingAmount: value.oldOutstandingAmount,
  };
}

export function toCreateLeaseBody(input: LeaseCreateInput): Record<string, unknown> {
  return {
    property_id: input.propertyId,
    room_id: input.roomId,
    resident_id: input.residentId,
    resident: input.resident ? { full_name: input.resident.fullName.trim() } : undefined,
    start_date: input.startDate,
    billing_cycle: input.billingCycle,
    billing_anchor_day: input.billingAnchorDay,
    notes: text(input.notes),
  };
}

function toCloseBody(input: LeaseCloseInput): Record<string, unknown> {
  return {
    end_date: input.endDate,
    room_status_after: input.roomStatusAfter,
    reason: input.reason.trim(),
    damage_deductions: input.damageDeductions?.map((deduction) => ({
      amount: deduction.amount,
      reason: deduction.reason.trim(),
    })),
    refund: input.refund
      ? { amount: input.refund.amount, reason: text(input.refund.reason) }
      : undefined,
  };
}

function toPaymentBody(payment: DepositCollectInput["payment"]) {
  return {
    payment_method: payment.paymentMethod,
    payment_code: text(payment.paymentCode),
    reference_number: text(payment.referenceNumber),
  };
}

function toTransferBody(input: TransferInput): Record<string, unknown> {
  return {
    target_room_id: input.targetRoomId,
    effective_date: input.effectiveDate,
    reason_code: input.reasonCode,
    reason_detail: text(input.reasonDetail),
    exception_reason: input.exceptionReason.trim(),
    top_up: input.topUp
      ? { amount: input.topUp.amount, payment: toPaymentBody(input.topUp.payment) }
      : undefined,
  };
}

function toTransferScheduleBody(input: TransferScheduleInput): Record<string, unknown> {
  return {
    target_room_id: input.targetRoomId,
    effective_date: input.effectiveDate,
    reason_code: input.reasonCode,
    reason_detail: text(input.reasonDetail),
  };
}

export function toRenewalIntentBody(input: RenewalIntentInput): Record<string, unknown> {
  return { effective_date: input.effectiveDate, note: text(input.note) };
}

export function toRenewalApprovalBody(input: RenewalApprovalInput): Record<string, unknown> {
  return {
    term_months: input.termMonths,
    billing_cycle: input.billingCycle,
    payment_plan_type: input.paymentPlanType,
  };
}

export const adminUxLeaseApi = {
  leases: {
    list: (input: LeaseListInput) =>
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/leases", {
          query: {
            ...pageQuery(input),
            status: input.status,
            resident_id: input.residentId,
            room_id: input.roomId,
            kost_type_id: input.kostTypeId,
            q: text(input.q),
          },
        })
        .then((envelope) => mapV2Page<LeaseSummary>(envelope)),
    overdue: (input: LeasePageInput) =>
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/leases/overdue", { query: pageQuery(input) })
        .then((envelope) => mapV2Page<LeaseSummary>(envelope)),
    residentOptions: (input: LeasePageInput) =>
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/leases/resident-options", {
          query: pageQuery(input),
        })
        .then((envelope) => mapV2Page<LeaseResidentOption>(envelope)),
    detail: async (leaseId: string) =>
      sanitizeLeaseDetailResponse(
        await data<LeaseDetailResponse>(
          adminUxV2Requester.get<V2DataEnvelope<unknown>>("/leases/" + encodeURIComponent(leaseId)),
        ),
      ),
    billingSummary: (leaseId: string) =>
      data<LeaseBillingSummary>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/billing-summary",
        ),
      ),
    create: (input: LeaseCreateInput, idempotencyKey: string) =>
      data<LeaseCreateResult>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>("/leases", toCreateLeaseBody(input), {
          idempotencyKey,
        }),
      ),
    close: (leaseId: string, input: LeaseCloseInput, idempotencyKey: string) =>
      data<LeaseCloseResult>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/close",
          toCloseBody(input),
          { idempotencyKey },
        ),
      ),
    collectDeposit: (leaseId: string, input: DepositCollectInput, idempotencyKey: string) =>
      data<{
        depositTransaction: DepositLedgerEntry;
        payment: { id: string; paymentCode: string; paymentStatus: "verified" } | null;
        depositSummary: LeaseDetailResponse["depositSummary"];
      }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/deposit/collect",
          {
            transaction_type: input.transactionType,
            amount: input.amount,
            payment: toPaymentBody(input.payment),
            override_reason: text(input.overrideReason),
          },
          { idempotencyKey },
        ),
      ),
    settleRefund: (
      leaseId: string,
      refundId: string,
      input: RefundSettlementInput,
      idempotencyKey: string,
    ) =>
      data<{ refund: DepositLedgerEntry; depositSummary: LeaseDetailResponse["depositSummary"] }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/refunds/" +
            encodeURIComponent(refundId) +
            "/settle",
          {
            payment_method: input.paymentMethod,
            external_reference: input.externalReference.trim(),
            notes: text(input.notes),
          },
          { idempotencyKey },
        ),
      ),
    waiveRefund: (leaseId: string, refundId: string, reason: string, idempotencyKey: string) =>
      data<{ refund: DepositLedgerEntry; depositSummary: LeaseDetailResponse["depositSummary"] }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/refunds/" +
            encodeURIComponent(refundId) +
            "/waive",
          { reason: reason.trim() },
          { idempotencyKey },
        ),
      ),
  },
  checkout: {
    list: (leaseId: string) =>
      data<{ commands: CheckoutCommand[] }>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/checkout",
        ),
      ),
    notice: (leaseId: string, input: CheckoutNoticeInput, idempotencyKey: string) =>
      data<{ checkout: CheckoutCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/checkout",
          {
            exit_type: input.exitType,
            effective_date: input.effectiveDate,
            reason: input.reason.trim(),
            notice_exception_reason: text(input.noticeExceptionReason),
          },
          { idempotencyKey },
        ),
      ),
    schedule: (
      leaseId: string,
      commandId: string,
      input: CheckoutApprovalInput,
      idempotencyKey: string,
    ) =>
      data<{ checkout: CheckoutCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/schedule",
          {
            approved_short_notice_charge: input.approvedShortNoticeCharge,
            short_notice_waiver_reason: text(input.shortNoticeWaiverReason),
          },
          { idempotencyKey },
        ),
      ),
    handover: (
      leaseId: string,
      commandId: string,
      input: CheckoutHandoverInput,
      idempotencyKey: string,
    ) =>
      data<{ checkout: CheckoutCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/handover",
          {
            key_access_confirmed: input.keyAccessConfirmed,
            inventory_confirmed: input.inventoryConfirmed,
            parking_confirmed: input.parkingConfirmed,
            inventory_items: input.inventoryItems.map((item) => ({
              name: item.name.trim(),
              expected_quantity: item.expectedQuantity,
              returned_quantity: item.returnedQuantity,
              condition: item.condition,
              notes: text(item.notes),
            })),
            key_access_items: input.keyAccessItems.map((item) => ({
              name: item.name.trim(),
              expected_quantity: item.expectedQuantity,
              returned_quantity: item.returnedQuantity,
              status: item.status,
              notes: text(item.notes),
            })),
            utility_readings: input.utilityReadings?.map((reading) => ({
              utility_type: reading.utilityType.trim(),
              meter_number: text(reading.meterNumber),
              checkout_reading: reading.checkoutReading.trim(),
              unit: reading.unit.trim(),
              outstanding_usage_notes: text(reading.outstandingUsageNotes),
            })),
            key_access_file_ids: input.keyAccessFileIds,
            inventory_file_ids: input.inventoryFileIds,
            parking_file_ids: input.parkingFileIds,
            notes: text(input.notes),
          },
          { idempotencyKey },
        ),
      ),
    inspection: (
      leaseId: string,
      commandId: string,
      input: CheckoutInspectionInput,
      idempotencyKey: string,
    ) =>
      data<{ checkout: CheckoutCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/inspection",
          {
            room_status_after: input.roomStatusAfter,
            inspection_file_ids: input.inspectionFileIds,
            notes: text(input.notes),
          },
          { idempotencyKey },
        ),
      ),
    complete: (
      leaseId: string,
      commandId: string,
      input: CheckoutCompleteInput,
      idempotencyKey: string,
    ) =>
      data<{
        checkout: CheckoutCommand;
        refundDueDate: string | null;
        refundTransactionId: string | null;
        finalSettlementId: string | null;
        invoiceCreditAmount: number;
        amountDue: number;
      }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/complete",
          {
            room_status_after: input.roomStatusAfter,
            damage_deductions: input.damageDeductions?.map((item) => ({
              amount: item.amount,
              reason: item.reason,
              evidence_file_ids: item.evidenceFileIds,
            })),
            deposit_rent_offset_amount: input.depositRentOffsetAmount,
            deposit_rent_offset_reason: text(input.depositRentOffsetReason),
            deposit_rent_offset_evidence_file_ids: input.depositRentOffsetEvidenceFileIds,
            final_refund_amount: input.finalRefundAmount,
            refund_adjustment_reason: text(input.refundAdjustmentReason),
            refund_adjustment_evidence_file_ids: input.refundAdjustmentEvidenceFileIds,
            refund_reason: text(input.refundReason),
          },
          { idempotencyKey },
        ),
      ),
    previewSettlement: (leaseId: string, commandId: string, input: CheckoutCompleteInput) =>
      data<{ quote: CheckoutSettlementQuote }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/settlement-preview",
          {
            room_status_after: input.roomStatusAfter,
            damage_deductions: input.damageDeductions?.map((item) => ({
              amount: item.amount,
              reason: item.reason,
              evidence_file_ids: item.evidenceFileIds,
            })),
            deposit_rent_offset_amount: input.depositRentOffsetAmount,
          },
        ),
      ),
    settleRefund: (
      leaseId: string,
      commandId: string,
      refundId: string,
      input: CheckoutRefundSettlementInput,
      idempotencyKey: string,
    ) =>
      data<{ refundId: string; settlementStatus: string; lateSettlement: boolean }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/refunds/" +
            encodeURIComponent(refundId) +
            "/settle",
          {
            payment_method: input.paymentMethod,
            external_reference: input.externalReference.trim(),
            evidence_file_ids: input.evidenceFileIds,
            notes: text(input.notes),
          },
          { idempotencyKey },
        ),
      ),
    waiveRefund: (
      leaseId: string,
      commandId: string,
      refundId: string,
      reason: string,
      idempotencyKey: string,
    ) =>
      data<{ refundId: string; settlementStatus: string; lateSettlement: boolean }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/refunds/" +
            encodeURIComponent(refundId) +
            "/waive",
          { reason: reason.trim() },
          { idempotencyKey },
        ),
      ),
    cancel: (leaseId: string, commandId: string, reason: string, idempotencyKey: string) =>
      data<{ checkout: CheckoutCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/checkout/" +
            encodeURIComponent(commandId) +
            "/cancel",
          { reason: reason.trim() },
          { idempotencyKey },
        ),
      ),
  },
  transfer: {
    preview: (leaseId: string, input: TransferPreviewInput) =>
      data<TransferPreview>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/transfer/preview",
          {
            target_room_id: input.targetRoomId,
            effective_date: input.effectiveDate,
            transfer_path: input.transferPath,
          },
        ),
      ),
    command: async (leaseId: string, input: TransferInput, idempotencyKey: string) =>
      sanitizeTransferResult(
        await data<TransferResult>(
          adminUxV2Requester.post<V2DataEnvelope<unknown>>(
            "/leases/" + encodeURIComponent(leaseId) + "/transfer",
            toTransferBody(input),
            { idempotencyKey },
          ),
        ),
      ),
    /** W07B normal path: persists a command executed only at the billing boundary. */
    schedule: (leaseId: string, input: TransferScheduleInput, idempotencyKey: string) =>
      data<{ scheduledTransfer: TransferCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/transfer/schedule",
          toTransferScheduleBody(input),
          { idempotencyKey },
        ),
      ),
    commands: (leaseId: string) =>
      data<{ items: TransferCommand[] }>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/transfers",
        ),
      ),
    cancel: (leaseId: string, commandId: string, reason: string, idempotencyKey: string) =>
      data<{ scheduledTransfer: TransferCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/transfers/" +
            encodeURIComponent(commandId) +
            "/cancel",
          { reason: reason.trim() },
          { idempotencyKey },
        ),
      ),
  },
  renewal: {
    commands: (leaseId: string) =>
      data<{ items: RenewalCommand[] }>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/renewals",
        ),
      ),
    eligibility: (leaseId: string) =>
      data<{ eligibility: RenewalEligibility }>(
        adminUxV2Requester.get<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/renewals/eligibility",
        ),
      ),
    intent: (leaseId: string, input: RenewalIntentInput, idempotencyKey: string) =>
      data<{ renewal: RenewalCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" + encodeURIComponent(leaseId) + "/renewals",
          toRenewalIntentBody(input),
          { idempotencyKey },
        ),
      ),
    approve: (
      leaseId: string,
      commandId: string,
      input: RenewalApprovalInput,
      idempotencyKey: string,
    ) =>
      data<{ renewal: RenewalCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/renewals/" +
            encodeURIComponent(commandId) +
            "/approve",
          toRenewalApprovalBody(input),
          { idempotencyKey },
        ),
      ),
    prepareFinancials: (leaseId: string, commandId: string, idempotencyKey: string) =>
      data<{ renewal: RenewalCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/renewals/" +
            encodeURIComponent(commandId) +
            "/financials",
          {},
          { idempotencyKey },
        ),
      ),
    authorizeActivation: (leaseId: string, commandId: string, idempotencyKey: string) =>
      data<{ renewal: RenewalCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/renewals/" +
            encodeURIComponent(commandId) +
            "/authorize-activation",
          {},
          { idempotencyKey },
        ),
      ),
    cancel: (leaseId: string, commandId: string, reason: string, idempotencyKey: string) =>
      data<{ renewal: RenewalCommand }>(
        adminUxV2Requester.post<V2DataEnvelope<unknown>>(
          "/leases/" +
            encodeURIComponent(leaseId) +
            "/renewals/" +
            encodeURIComponent(commandId) +
            "/cancel",
          { reason: reason.trim() },
          { idempotencyKey },
        ),
      ),
  },
  rooms: {
    listAvailable: (
      input: LeasePageInput & { q?: string; kostTypeId?: string; commercialDate?: string },
    ) =>
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/rooms", {
          query: {
            ...pageQuery(input),
            status: "vacant",
            kost_type_id: input.kostTypeId,
            q: text(input.q),
            commercial_date: input.commercialDate,
          },
        })
        .then((envelope) => parseAvailableRooms(envelope, input.propertyId)),
  },
};

export function parseAvailableRooms(envelope: V2ListEnvelope<unknown>, expectedPropertyId: string) {
  const page = mapV2Page<Record<string, unknown>>(envelope);
  if (
    ![page.total, page.limit, page.offset].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  ) {
    throw new Error("Invalid vacant-room pagination");
  }
  return {
    ...page,
    items: page.items.map((item): LeaseRoomOption => {
      const kostType = item.kostType;
      if (
        typeof item.id !== "string" ||
        typeof item.number !== "string" ||
        item.propertyId !== expectedPropertyId ||
        item.status !== "vacant" ||
        !["male", "female", "mixed"].includes(String(item.genderPolicy)) ||
        kostType === null ||
        typeof kostType !== "object"
      )
        throw new Error("Invalid vacant-room response");
      const type = kostType as Record<string, unknown>;
      if (
        typeof type.id !== "string" ||
        typeof type.name !== "string" ||
        !["rukost", "apartkost"].includes(String(type.category)) ||
        ![type.monthlyPrice, type.yearlyPrice, type.depositAmount].every(
          (value) => Number.isSafeInteger(value) && Number(value) >= 0,
        )
      )
        throw new Error("Invalid vacant-room commercial authority");
      return {
        id: item.id,
        number: item.number,
        genderPolicy: item.genderPolicy as LeaseRoomOption["genderPolicy"],
        roomStatus: "vacant",
        buildingName: typeof item.buildingName === "string" ? item.buildingName : null,
        buildingCode: typeof item.buildingCode === "string" ? item.buildingCode : null,
        unitCode: typeof item.unitCode === "string" ? item.unitCode : null,
        floorLabel: typeof item.floorLabel === "string" ? item.floorLabel : null,
        floor: typeof item.floor === "string" ? item.floor : null,
        kostType: {
          id: type.id,
          name: type.name,
          category: type.category as LeaseRoomOption["kostType"]["category"],
          monthlyPrice: Number(type.monthlyPrice),
          yearlyPrice: Number(type.yearlyPrice),
          depositAmount: Number(type.depositAmount),
        },
      };
    }),
  };
}
