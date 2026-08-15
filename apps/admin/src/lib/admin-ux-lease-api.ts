// Typed, property-scoped client for the M5/M6 lease lifecycle contract.
// Lifecycle commands always wait for a server response and receive the
// Idempotency-Key owned by the submitting UI intent.
import { adminUxV2Requester, type AdminUxQueryValue } from "./admin-ux-api";
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

export type DepositCollectInput = {
  transactionType: "collection" | "top_up";
  amount: number;
  payment: { paymentMethod: PaymentMethod; paymentCode?: string; referenceNumber?: string };
  overrideReason?: string;
};

export type TransferPreviewInput = {
  targetRoomId: string;
  effectiveDate: string;
  transferPath?: TransferPath;
};

/** W07B decision 4: fixed reason taxonomy; same-day exceptions need a reason. */
export type TransferReasonFields = {
  reasonCode: TransferReasonCode;
  reasonDetail?: string;
};

export type TransferInput = TransferPreviewInput &
  TransferReasonFields & {
    exceptionReason: string;
    topUp?: {
      amount: number;
      payment: { paymentMethod: PaymentMethod; paymentCode?: string; referenceNumber?: string };
    };
  };

/** W07B normal path: no top-up and no immediate lifecycle change. */
export type TransferScheduleInput = Omit<TransferPreviewInput, "transferPath"> &
  TransferReasonFields;

export type RefundSettlementInput = {
  paymentMethod: PaymentMethod;
  externalReference: string;
  notes?: string;
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
  rooms: {
    listAvailable: (input: LeasePageInput & { q?: string; kostTypeId?: string }) =>
      adminUxV2Requester
        .get<V2ListEnvelope<unknown>>("/rooms", {
          query: {
            ...pageQuery(input),
            status: "vacant",
            kost_type_id: input.kostTypeId,
            q: text(input.q),
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
