import type { RoleCode } from "@granada-kost/domain";
import { getAccessToken } from "@/lib/api";
import { adminUxV2Requester, type AdminUxV2Requester } from "@/lib/admin-ux-api";
import { fetchPreviewAndDownload } from "@/lib/document-download";
import { env } from "@/lib/env";

export const W06_INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export const W06_PAGE_SIZE = 15;
export const W06_PAYMENT_PURPOSES = [
  "rent",
  "dp",
  "booking_fee",
  "down_payment",
  "full_settlement",
  "security_deposit",
  "other_charge",
] as const;
export const W06_PAYMENT_METHODS = ["bank_transfer", "cash"] as const;

export type W06InvoiceStatus = (typeof W06_INVOICE_STATUSES)[number];
export type W06PaymentPurpose = (typeof W06_PAYMENT_PURPOSES)[number];
export type W06PaymentMethod = (typeof W06_PAYMENT_METHODS)[number];
export const W06_PAYMENT_STATUSES = [
  "pending_confirmation",
  "verified",
  "rejected",
  "reversed",
] as const;
export type W06PaymentStatus = (typeof W06_PAYMENT_STATUSES)[number];

export const BILLING_DOCUMENT_SEARCH_TYPES = [
  "invoice",
  "payment_receipt",
  "payment_reversal_receipt",
  "booking_payment_receipt",
  "booking_refund_receipt",
  "checkout_handover",
  "final_settlement",
  "checkout_refund_receipt",
] as const;
export type BillingDocumentSearchType = (typeof BILLING_DOCUMENT_SEARCH_TYPES)[number];

export type BillingDocumentSearchItem = {
  id: string;
  document_type: BillingDocumentSearchType;
  document_code: string;
  title: string;
  resident_name: string;
  room_number: string | null;
  issued_at: string;
  amount: number | null;
  status: string;
  booking_lead_id: string | null;
  lease_id: string | null;
  checkout_command_id: string | null;
};

export type BillingDocumentSearchPage = {
  data: BillingDocumentSearchItem[];
  meta: { limit: number; offset: number; total: number; query: string };
};

export type BillingWorklistItem = {
  id: string;
  invoice_code: string;
  resident_id: string;
  lease_id: string;
  resident_name: string;
  room_number: string;
  coverage_start: string;
  coverage_end: string;
  due_date: string;
  invoice_status: Exclude<W06InvoiceStatus, "draft" | "paid" | "void">;
  total_amount: number;
  outstanding_amount: number;
};

export type BillingWorklist = {
  data: BillingWorklistItem[];
  meta: { limit: number; offset: number; total: number; month: string };
};

export type BillingAllocation = { invoice_id: string; amount: number };
export type BillingEvidence = {
  id: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "application/pdf";
  file_size_bytes: number;
  content_path: string;
};
export type BillingPayment = {
  id: string;
  payment_code: string;
  payment_method: W06PaymentMethod;
  payment_status: W06PaymentStatus;
  payment_purpose: W06PaymentPurpose | null;
  amount: number;
  paid_at: string | null;
  verified_at: string | null;
  reversal_id: string | null;
  receipt_id: string | null;
  reversal_receipt_id: string | null;
  reversal_reason: string | null;
  reversed_at: string | null;
  allocations: BillingAllocation[];
};
export type BillingWorkspacePayment = BillingPayment & {
  resident_id: string;
  lease_id: string;
  resident_name: string;
  room_number: string;
  reference_number: string | null;
  rent_allocation_amount: number;
  settles_rent_contract: boolean;
  evidence: BillingEvidence[];
};

export type BillingReceipt = {
  id: string;
  receipt_code: string;
  receipt_kind: "payment" | "reversal";
  amount: number;
  issued_at: string;
  snapshot: {
    payment_code: string;
    payment_method: W06PaymentMethod;
    payment_purpose: W06PaymentPurpose;
    lease_id: string | null;
    allocations: BillingAllocation[];
  };
};

export type BillingProof = {
  id: string;
  invoice_id: string;
  invoice_code: string;
  resident_id: string;
  resident_name: string;
  room_number: string;
  proof_status: "pending_review" | "verified" | "rejected" | "expired";
  claimed_amount: number;
  payment_purpose: W06PaymentPurpose;
  uploaded_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  notes: string | null;
  evidence: BillingEvidence[];
};

export type BillingPage<T> = { data: T[]; meta: { limit: number; offset: number; total: number } };

export type ResidentBilling = {
  lease: {
    id: string;
    resident_id: string;
    resident_name: string;
    room_number: string;
    status: "awaiting_activation" | "active" | "completed" | "ended" | "cancelled" | "transferred";
    start_date: string;
    end_date: string;
    payment_plan: "annual_full" | "monthly_installments" | "two_month_installments";
    contract_rent: number;
    monthly_rate: number;
    remaining_days: number;
    note: string;
  };
  summary: {
    rent_invoiced: number;
    rent_paid: number;
    rent_outstanding: number;
    security_deposit_required: number;
    deposit_collected: number;
    deposit_deducted: number;
    deposit_refunded: number;
    deposit_balance: number;
    installment_paid: number;
    installment_total: number;
    next_due_date: string | null;
    overdue_count: number;
  };
  contract_settlement: {
    id: string;
    invoice_id: string;
    policy_version: "legacy_v1" | "lease_settlement_v2";
    status:
      | "awaiting_activation"
      | "open"
      | "extended"
      | "overdue"
      | "admin_action_required"
      | "termination_pending"
      | "terminated"
      | "paid"
      | "cancelled";
    activated_at: string | null;
    original_due_at: string | null;
    extension_due_at: string | null;
    extension_reason: string | null;
    effective_due_at: string | null;
    contract_rent_amount: number;
    initial_rent_credit: number;
    payment_allocated: number;
    first_payment_checkpoint: {
      due_at: string | null;
      required_additional_amount: number;
      additional_payment_received: number;
      remaining_amount: number;
      status: "not_required" | "pending" | "met_early" | "met" | "overdue";
    };
    deposit_offset_amount: number;
    outstanding_amount: number;
    checkpoint_shortfall_amount: number;
    reminder_stage: "H-30" | "H-14" | "H-7" | "H-3" | "H-1" | "H-0" | "D+1" | "D+7" | null;
    admin_action_required: boolean;
    termination_eligible: boolean;
    partial_payment_allowed: boolean;
    full_payment_required: boolean;
    extension_available: boolean;
    payment_promise: {
      id: string;
      promised_amount: number;
      promised_payment_date: string;
      note: string;
      recorded_at: string;
    } | null;
    termination_case: {
      id: string;
      status: "pending" | "cancelled" | "checked_out";
      planned_checkout_date: string;
    } | null;
  } | null;
  invoices: Array<{
    id: string;
    invoice_code: string;
    invoice_status: W06InvoiceStatus;
    invoice_purpose: "rent" | "other_charge";
    total_amount: number;
    outstanding_amount: number;
    due_date: string;
    coverage_start: string;
    coverage_end: string;
  }>;
  payments: BillingPayment[];
  financial_timeline: Array<{
    id: string;
    event_type:
      | "payment_recorded"
      | "payment_reversed"
      | "booking_refund"
      | "deposit_collected"
      | "deposit_deducted"
      | "deposit_refunded"
      | "invoice_adjustment"
      | "exit_refund";
    occurred_at: string;
    amount: number;
    direction: "inbound" | "outbound" | "adjustment";
    status: string;
    reference: string | null;
    subtype: string | null;
    source: string;
    note: string | null;
    actor_name: string;
    receipt_id: string | null;
    exit_document_id: string | null;
  }>;
  exit_documents: Array<{
    id: string;
    checkout_command_id: string;
    document_code: string;
    document_kind: "checkout_handover" | "final_settlement" | "refund_receipt";
    issued_at: string;
  }>;
  proofs: Array<{
    id: string;
    invoice_id: string;
    proof_status: "pending_review" | "verified" | "rejected" | "expired";
    claimed_amount: number;
    payment_purpose: W06PaymentPurpose;
    uploaded_at: string;
    reviewed_at: string | null;
    reject_reason: string | null;
  }>;
};

export type ManualPaymentInput = {
  property_id: string;
  resident_id: string;
  lease_id: string;
  method: W06PaymentMethod;
  payment_purpose: W06PaymentPurpose;
  amount: number;
  paid_at?: string;
  reference_number?: string;
  note?: string;
  evidence_file_ids?: string[];
  allocations: BillingAllocation[];
};

export type OtherChargeInput = {
  property_id: string;
  resident_id: string;
  lease_id: string;
  category:
    | "documented_damage"
    | "utilities"
    | "parking"
    | "lost_key_or_access_card"
    | "approved_administration"
    | "other";
  description: string;
  amount: number;
  due_date: string;
  evidence_file_ids?: string[];
};

export type SafePaymentResult = {
  payment_id: string;
  payment_code: string;
  payment_status: W06PaymentStatus;
  payment_purpose: W06PaymentPurpose;
  amount: number;
  receipt_id: string | null;
};

export type ContractSettlementExtensionInput = {
  property_id: string;
  extension_days: number;
  reason: string;
};

export type LeasePaymentPromiseInput = {
  property_id: string;
  promised_amount: number;
  promised_payment_date: string;
  note: string;
};

export type StartLeaseTerminationInput = {
  property_id: string;
  reason: string;
  notes?: string;
  planned_checkout_date: string;
};

export type CancelLeaseTerminationInput = {
  property_id: string;
  reason: string;
};

export type FinalizeLeaseTerminationInput = {
  property_id: string;
  inspection_notes?: string;
  room_status_after_checkout: "vacant" | "maintenance";
  damage_deduction_amount: number;
  damage_reason?: string;
  damage_evidence_file_id?: string;
  refund_amount: number;
  refund_method?: "cash" | "bank_transfer";
  refunded_at?: string;
  refund_note?: string;
  refund_evidence_file_id?: string;
};

type Requester = Pick<AdminUxV2Requester, "get" | "post">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_DATE = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Respons ${label} tidak valid.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`Respons ${label} tidak valid.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("|") !== [...keys].sort().join("|"))
    throw new Error(`Respons ${label} memiliki field yang tidak dikenal.`);
  return record;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} tidak valid.`);
  return value;
}
function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!UUID.test(result)) throw new Error(`${label} tidak valid.`);
  return result;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} tidak valid.`);
  return value;
}
function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} tidak valid.`);
  return value;
}
function date(value: unknown, label: string): string {
  const result = text(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) throw new Error(`${label} tidak valid.`);
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  )
    throw new Error(`${label} tidak valid.`);
  return result;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!TIMESTAMP.test(result) || Number.isNaN(Date.parse(result)))
    throw new Error(`${label} tidak valid.`);
  return result;
}
function nullable<T>(value: unknown, parse: (item: unknown) => T): T | null {
  return value === null ? null : parse(value);
}
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  const result = text(value, label);
  if (!values.includes(result as T)) throw new Error(`${label} tidak valid.`);
  return result as T;
}

function allocation(value: unknown): BillingAllocation {
  const record = object(value, ["invoice_id", "amount"], "alokasi");
  return {
    invoice_id: uuid(record.invoice_id, "ID invoice"),
    amount: integer(record.amount, "Nominal alokasi"),
  };
}

function payment(value: unknown): BillingPayment {
  const record = object(
    value,
    [
      "id",
      "payment_code",
      "payment_method",
      "payment_status",
      "payment_purpose",
      "amount",
      "paid_at",
      "verified_at",
      "reversal_id",
      "receipt_id",
      "reversal_receipt_id",
      "reversal_reason",
      "reversed_at",
      "allocations",
    ],
    "pembayaran",
  );
  if (!Array.isArray(record.allocations)) throw new Error("Alokasi pembayaran tidak valid.");
  return {
    id: uuid(record.id, "ID pembayaran"),
    payment_code: text(record.payment_code, "Kode pembayaran"),
    payment_method: oneOf(record.payment_method, W06_PAYMENT_METHODS, "Metode pembayaran"),
    payment_status: oneOf(record.payment_status, W06_PAYMENT_STATUSES, "Status pembayaran"),
    payment_purpose: nullable(record.payment_purpose, (item) =>
      oneOf(item, W06_PAYMENT_PURPOSES, "Tujuan pembayaran"),
    ),
    amount: integer(record.amount, "Nominal pembayaran"),
    paid_at: nullable(record.paid_at, (item) => timestamp(item, "Waktu pembayaran")),
    verified_at: nullable(record.verified_at, (item) => timestamp(item, "Waktu verifikasi")),
    reversal_id: nullable(record.reversal_id, (item) => uuid(item, "ID reversal")),
    receipt_id: nullable(record.receipt_id, (item) => uuid(item, "ID kuitansi")),
    reversal_receipt_id: nullable(record.reversal_receipt_id, (item) =>
      uuid(item, "ID kuitansi reversal"),
    ),
    reversal_reason: nullable(record.reversal_reason, (item) => text(item, "Alasan reversal")),
    reversed_at: nullable(record.reversed_at, (item) => timestamp(item, "Waktu reversal")),
    allocations: record.allocations.map(allocation),
  };
}

function evidence(value: unknown): BillingEvidence {
  const file = object(
    value,
    ["id", "original_filename", "mime_type", "file_size_bytes", "content_path"],
    "file bukti",
  );
  const id = uuid(file.id, "ID file");
  const contentPath = text(file.content_path, "Akses file");
  if (contentPath !== `/files/` + id + `/content`) throw new Error("Akses file bukti tidak valid.");
  return {
    id,
    original_filename: text(file.original_filename, "Nama file"),
    mime_type: oneOf(
      file.mime_type,
      ["image/jpeg", "image/png", "application/pdf"] as const,
      "MIME file",
    ),
    file_size_bytes: integer(file.file_size_bytes, "Ukuran file"),
    content_path: contentPath,
  };
}

function workspacePayment(value: unknown): BillingWorkspacePayment {
  const record = object(
    value,
    [
      "id",
      "payment_code",
      "payment_method",
      "payment_status",
      "payment_purpose",
      "amount",
      "paid_at",
      "verified_at",
      "reversal_id",
      "receipt_id",
      "reversal_receipt_id",
      "reversal_reason",
      "reversed_at",
      "allocations",
      "resident_id",
      "lease_id",
      "resident_name",
      "room_number",
      "reference_number",
      "rent_allocation_amount",
      "settles_rent_contract",
      "evidence",
    ],
    "pembayaran workspace",
  );
  if (!Array.isArray(record.evidence)) throw new Error("Bukti pembayaran tidak valid.");
  const base = payment({
    id: record.id,
    payment_code: record.payment_code,
    payment_method: record.payment_method,
    payment_status: record.payment_status,
    payment_purpose: record.payment_purpose,
    amount: record.amount,
    paid_at: record.paid_at,
    verified_at: record.verified_at,
    reversal_id: record.reversal_id,
    receipt_id: record.receipt_id,
    reversal_receipt_id: record.reversal_receipt_id,
    reversal_reason: record.reversal_reason,
    reversed_at: record.reversed_at,
    allocations: record.allocations,
  });
  return {
    ...base,
    resident_id: uuid(record.resident_id, "ID penghuni"),
    lease_id: uuid(record.lease_id, "ID sewa"),
    resident_name: text(record.resident_name, "Nama penghuni"),
    room_number: text(record.room_number, "Nomor kamar"),
    reference_number: nullable(record.reference_number, (item) =>
      text(item, "Referensi pembayaran"),
    ),
    rent_allocation_amount: integer(record.rent_allocation_amount, "Alokasi pembayaran sewa"),
    settles_rent_contract: flag(record.settles_rent_contract, "Penanda pelunasan kontrak"),
    evidence: record.evidence.map(evidence),
  };
}

function invoice(value: unknown): ResidentBilling["invoices"][number] {
  const record = object(
    value,
    [
      "id",
      "invoice_code",
      "invoice_status",
      "invoice_purpose",
      "total_amount",
      "outstanding_amount",
      "due_date",
      "coverage_start",
      "coverage_end",
    ],
    "invoice",
  );
  return {
    id: uuid(record.id, "ID invoice"),
    invoice_code: text(record.invoice_code, "Kode invoice"),
    invoice_status: oneOf(record.invoice_status, W06_INVOICE_STATUSES, "Status invoice"),
    invoice_purpose: oneOf(
      record.invoice_purpose,
      ["rent", "other_charge"] as const,
      "Jenis invoice",
    ),
    total_amount: integer(record.total_amount, "Total invoice"),
    outstanding_amount: integer(record.outstanding_amount, "Sisa invoice"),
    due_date: date(record.due_date, "Jatuh tempo"),
    coverage_start: date(record.coverage_start, "Awal cakupan"),
    coverage_end: date(record.coverage_end, "Akhir cakupan"),
  };
}

export function parseBillingWorklist(value: unknown): BillingWorklist {
  const record = object(value, ["data", "meta"], "daftar tagihan");
  if (!Array.isArray(record.data)) throw new Error("Daftar tagihan tidak valid.");
  const meta = object(record.meta, ["limit", "offset", "total", "month"], "paginasi tagihan");
  const month = date(meta.month, "Bulan tagihan");
  if (!MONTH_DATE.test(month)) throw new Error("Bulan tagihan tidak valid.");
  return {
    data: record.data.map((item) => {
      const row = object(
        item,
        [
          "id",
          "invoice_code",
          "resident_id",
          "lease_id",
          "resident_name",
          "room_number",
          "coverage_start",
          "coverage_end",
          "due_date",
          "invoice_status",
          "total_amount",
          "outstanding_amount",
        ],
        "item tagihan",
      );
      return {
        id: uuid(row.id, "ID invoice"),
        invoice_code: text(row.invoice_code, "Kode invoice"),
        resident_id: uuid(row.resident_id, "ID penghuni"),
        lease_id: uuid(row.lease_id, "ID sewa"),
        resident_name: text(row.resident_name, "Nama penghuni"),
        room_number: text(row.room_number, "Nomor kamar"),
        coverage_start: date(row.coverage_start, "Awal cakupan"),
        coverage_end: date(row.coverage_end, "Akhir cakupan"),
        due_date: date(row.due_date, "Jatuh tempo"),
        invoice_status: oneOf(
          row.invoice_status,
          ["issued", "partially_paid", "overdue"] as const,
          "Status invoice",
        ),
        total_amount: integer(row.total_amount, "Total invoice"),
        outstanding_amount: integer(row.outstanding_amount, "Sisa invoice"),
      };
    }),
    meta: {
      limit: integer(meta.limit, "Batas halaman"),
      offset: integer(meta.offset, "Offset halaman"),
      total: integer(meta.total, "Total data"),
      month,
    },
  };
}

export function parseBillingDocumentSearch(value: unknown): BillingDocumentSearchPage {
  const record = object(value, ["data", "meta"], "hasil pencarian dokumen");
  if (!Array.isArray(record.data)) throw new Error("Hasil pencarian dokumen tidak valid.");
  const meta = object(
    record.meta,
    ["limit", "offset", "total", "query"],
    "paginasi pencarian dokumen",
  );
  return {
    data: record.data.map((item) => {
      const row = object(
        item,
        [
          "id",
          "document_type",
          "document_code",
          "title",
          "resident_name",
          "room_number",
          "issued_at",
          "amount",
          "status",
          "booking_lead_id",
          "lease_id",
          "checkout_command_id",
        ],
        "dokumen pembayaran",
      );
      return {
        id: uuid(row.id, "ID dokumen"),
        document_type: oneOf(row.document_type, BILLING_DOCUMENT_SEARCH_TYPES, "Jenis dokumen"),
        document_code: text(row.document_code, "Nomor dokumen"),
        title: text(row.title, "Nama dokumen"),
        resident_name: text(row.resident_name, "Nama penghuni"),
        room_number: nullable(row.room_number, (item) => text(item, "Nomor kamar")),
        issued_at: timestamp(row.issued_at, "Waktu penerbitan"),
        amount: nullable(row.amount, (item) => integer(item, "Nominal dokumen")),
        status: text(row.status, "Status dokumen"),
        booking_lead_id: nullable(row.booking_lead_id, (item) => uuid(item, "ID minat booking")),
        lease_id: nullable(row.lease_id, (item) => uuid(item, "ID penyewaan")),
        checkout_command_id: nullable(row.checkout_command_id, (item) => uuid(item, "ID checkout")),
      };
    }),
    meta: {
      limit: integer(meta.limit, "Batas halaman"),
      offset: integer(meta.offset, "Offset halaman"),
      total: integer(meta.total, "Total data"),
      query: text(meta.query, "Kata kunci pencarian"),
    },
  };
}

export function parseResidentBilling(value: unknown): ResidentBilling {
  const envelope = object(value, ["data"], "detail billing penghuni");
  const data = object(
    envelope.data,
    [
      "lease",
      "summary",
      "contract_settlement",
      "invoices",
      "payments",
      "financial_timeline",
      "exit_documents",
      "proofs",
    ],
    "detail billing penghuni",
  );
  const lease = object(
    data.lease,
    [
      "id",
      "resident_id",
      "resident_name",
      "room_number",
      "status",
      "start_date",
      "end_date",
      "payment_plan",
      "contract_rent",
      "monthly_rate",
      "remaining_days",
      "note",
    ],
    "sewa",
  );
  const summary = object(
    data.summary,
    [
      "rent_invoiced",
      "rent_paid",
      "rent_outstanding",
      "security_deposit_required",
      "deposit_collected",
      "deposit_deducted",
      "deposit_refunded",
      "deposit_balance",
      "installment_paid",
      "installment_total",
      "next_due_date",
      "overdue_count",
    ],
    "ringkasan billing",
  );
  if (
    !Array.isArray(data.invoices) ||
    !Array.isArray(data.payments) ||
    !Array.isArray(data.financial_timeline) ||
    !Array.isArray(data.exit_documents) ||
    !Array.isArray(data.proofs)
  )
    throw new Error("Riwayat billing tidak valid.");
  const settlement = nullable(data.contract_settlement, (item) => {
    const record = object(
      item,
      [
        "id",
        "invoice_id",
        "policy_version",
        "status",
        "activated_at",
        "original_due_at",
        "extension_due_at",
        "extension_reason",
        "effective_due_at",
        "contract_rent_amount",
        "initial_rent_credit",
        "payment_allocated",
        "first_payment_checkpoint",
        "deposit_offset_amount",
        "outstanding_amount",
        "checkpoint_shortfall_amount",
        "reminder_stage",
        "admin_action_required",
        "termination_eligible",
        "partial_payment_allowed",
        "full_payment_required",
        "extension_available",
        "payment_promise",
        "termination_case",
      ],
      "pelunasan kontrak",
    );
    const terminationCase = nullable(record.termination_case, (value) => {
      const termination = object(
        value,
        ["id", "status", "planned_checkout_date"],
        "proses pemberhentian sewa",
      );
      return {
        id: uuid(termination.id, "ID proses pemberhentian"),
        status: oneOf(
          termination.status,
          ["pending", "cancelled", "checked_out"] as const,
          "Status proses pemberhentian",
        ),
        planned_checkout_date: date(termination.planned_checkout_date, "Tanggal checkout rencana"),
      };
    });
    const paymentPromise = nullable(record.payment_promise, (value) => {
      const promise = object(
        value,
        ["id", "promised_amount", "promised_payment_date", "note", "recorded_at"],
        "janji bayar",
      );
      return {
        id: uuid(promise.id, "ID janji bayar"),
        promised_amount: integer(promise.promised_amount, "Nominal janji bayar"),
        promised_payment_date: date(promise.promised_payment_date, "Tanggal janji bayar"),
        note: text(promise.note, "Catatan janji bayar"),
        recorded_at: timestamp(promise.recorded_at, "Waktu pencatatan janji bayar"),
      };
    });
    const boolean = (value: unknown, label: string) => {
      if (typeof value !== "boolean") throw new Error(`${label} tidak valid.`);
      return value;
    };
    const checkpoint = object(
      record.first_payment_checkpoint,
      [
        "due_at",
        "required_additional_amount",
        "additional_payment_received",
        "remaining_amount",
        "status",
      ],
      "checkpoint pembayaran pertama",
    );
    return {
      id: uuid(record.id, "ID pelunasan kontrak"),
      invoice_id: uuid(record.invoice_id, "ID invoice pelunasan kontrak"),
      policy_version: oneOf(
        record.policy_version,
        ["legacy_v1", "lease_settlement_v2"] as const,
        "Versi kebijakan pelunasan",
      ),
      status: oneOf(
        record.status,
        [
          "awaiting_activation",
          "open",
          "extended",
          "overdue",
          "admin_action_required",
          "termination_pending",
          "terminated",
          "paid",
          "cancelled",
        ] as const,
        "Status pelunasan kontrak",
      ),
      activated_at: nullable(record.activated_at, (value) => timestamp(value, "Waktu aktivasi")),
      original_due_at: nullable(record.original_due_at, (value) =>
        timestamp(value, "Tenggat awal"),
      ),
      extension_due_at: nullable(record.extension_due_at, (value) =>
        timestamp(value, "Tenggat perpanjangan"),
      ),
      extension_reason: nullable(record.extension_reason, (value) =>
        text(value, "Alasan perpanjangan"),
      ),
      effective_due_at: nullable(record.effective_due_at, (value) =>
        timestamp(value, "Tenggat efektif"),
      ),
      contract_rent_amount: integer(record.contract_rent_amount, "Total sewa kontrak"),
      initial_rent_credit: integer(record.initial_rent_credit, "Kredit sewa awal"),
      payment_allocated: integer(record.payment_allocated, "Pembayaran sewa"),
      first_payment_checkpoint: {
        due_at: nullable(checkpoint.due_at, (value) =>
          timestamp(value, "Tenggat checkpoint pertama"),
        ),
        required_additional_amount: integer(
          checkpoint.required_additional_amount,
          "Minimum pembayaran checkpoint pertama",
        ),
        additional_payment_received: integer(
          checkpoint.additional_payment_received,
          "Pembayaran untuk checkpoint pertama",
        ),
        remaining_amount: integer(checkpoint.remaining_amount, "Sisa checkpoint pertama"),
        status: oneOf(
          checkpoint.status,
          ["not_required", "pending", "met_early", "met", "overdue"] as const,
          "Status checkpoint pembayaran pertama",
        ),
      },
      deposit_offset_amount: integer(record.deposit_offset_amount, "Potongan deposit sewa"),
      outstanding_amount: integer(record.outstanding_amount, "Saldo sewa kontrak"),
      checkpoint_shortfall_amount: integer(
        record.checkpoint_shortfall_amount,
        "Kekurangan checkpoint",
      ),
      reminder_stage: nullable(record.reminder_stage, (value) =>
        oneOf(
          value,
          ["H-30", "H-14", "H-7", "H-3", "H-1", "H-0", "D+1", "D+7"] as const,
          "Tahap pengingat",
        ),
      ),
      admin_action_required: boolean(record.admin_action_required, "Kebutuhan tindakan admin"),
      termination_eligible: boolean(record.termination_eligible, "Kelayakan pemberhentian"),
      partial_payment_allowed: boolean(record.partial_payment_allowed, "Izin pembayaran sebagian"),
      full_payment_required: boolean(record.full_payment_required, "Kewajiban pelunasan penuh"),
      extension_available: boolean(record.extension_available, "Izin perpanjangan"),
      payment_promise: paymentPromise,
      termination_case: terminationCase,
    };
  });
  return {
    lease: {
      id: uuid(lease.id, "ID sewa"),
      resident_id: uuid(lease.resident_id, "ID penghuni"),
      resident_name: text(lease.resident_name, "Nama penghuni"),
      room_number: text(lease.room_number, "Nomor kamar"),
      status: oneOf(
        lease.status,
        [
          "awaiting_activation",
          "active",
          "completed",
          "ended",
          "cancelled",
          "transferred",
        ] as const,
        "Status sewa",
      ),
      start_date: date(lease.start_date, "Tanggal mulai"),
      end_date: date(lease.end_date, "Tanggal selesai"),
      payment_plan: oneOf(
        lease.payment_plan,
        ["annual_full", "monthly_installments", "two_month_installments"] as const,
        "Paket pembayaran",
      ),
      contract_rent: integer(lease.contract_rent, "Nilai kontrak"),
      monthly_rate: integer(lease.monthly_rate, "Tarif bulanan"),
      remaining_days: integer(lease.remaining_days, "Sisa hari"),
      note: text(lease.note, "Catatan sewa"),
    },
    summary: {
      rent_invoiced: integer(summary.rent_invoiced, "Sewa ditagihkan"),
      rent_paid: integer(summary.rent_paid, "Sewa dibayar"),
      rent_outstanding: integer(summary.rent_outstanding, "Sisa sewa"),
      security_deposit_required: integer(summary.security_deposit_required, "Deposit wajib"),
      deposit_collected: integer(summary.deposit_collected, "Deposit terkumpul"),
      deposit_deducted: integer(summary.deposit_deducted, "Potongan deposit"),
      deposit_refunded: integer(summary.deposit_refunded, "Deposit dikembalikan"),
      deposit_balance: integer(summary.deposit_balance, "Saldo deposit"),
      installment_paid: integer(summary.installment_paid, "Angsuran lunas"),
      installment_total: integer(summary.installment_total, "Jumlah angsuran"),
      next_due_date: nullable(summary.next_due_date, (item) =>
        date(item, "Jatuh tempo berikutnya"),
      ),
      overdue_count: integer(summary.overdue_count, "Jumlah terlambat"),
    },
    contract_settlement: settlement,
    invoices: data.invoices.map(invoice),
    payments: data.payments.map(payment),
    financial_timeline: data.financial_timeline.map((item) => {
      const event = object(
        item,
        [
          "id",
          "event_type",
          "occurred_at",
          "amount",
          "direction",
          "status",
          "reference",
          "subtype",
          "source",
          "note",
          "actor_name",
          "receipt_id",
          "exit_document_id",
        ],
        "peristiwa finansial",
      );
      return {
        id: uuid(event.id, "ID peristiwa finansial"),
        event_type: oneOf(
          event.event_type,
          [
            "payment_recorded",
            "payment_reversed",
            "booking_refund",
            "deposit_collected",
            "deposit_deducted",
            "deposit_refunded",
            "invoice_adjustment",
            "exit_refund",
          ] as const,
          "Jenis peristiwa finansial",
        ),
        occurred_at: timestamp(event.occurred_at, "Waktu peristiwa finansial"),
        amount: integer(event.amount, "Nominal peristiwa finansial"),
        direction: oneOf(
          event.direction,
          ["inbound", "outbound", "adjustment"] as const,
          "Arah peristiwa finansial",
        ),
        status: text(event.status, "Status peristiwa finansial"),
        reference: nullable(event.reference, (value) => text(value, "Referensi finansial")),
        subtype: nullable(event.subtype, (value) => text(value, "Subjenis finansial")),
        source: text(event.source, "Sumber peristiwa finansial"),
        note: nullable(event.note, (value) => text(value, "Catatan peristiwa finansial")),
        actor_name: text(event.actor_name, "Pencatat peristiwa finansial"),
        receipt_id: nullable(event.receipt_id, (value) => uuid(value, "ID kuitansi finansial")),
        exit_document_id: nullable(event.exit_document_id, (value) =>
          uuid(value, "ID dokumen checkout finansial"),
        ),
      };
    }),
    exit_documents: data.exit_documents.map((item) => {
      const document = object(
        item,
        ["id", "checkout_command_id", "document_code", "document_kind", "issued_at"],
        "dokumen checkout",
      );
      return {
        id: uuid(document.id, "ID dokumen checkout"),
        checkout_command_id: uuid(document.checkout_command_id, "ID perintah checkout"),
        document_code: text(document.document_code, "Kode dokumen checkout"),
        document_kind: oneOf(
          document.document_kind,
          ["checkout_handover", "final_settlement", "refund_receipt"] as const,
          "Jenis dokumen checkout",
        ),
        issued_at: timestamp(document.issued_at, "Waktu dokumen checkout"),
      };
    }),
    proofs: data.proofs.map((item) => {
      const proof = object(
        item,
        [
          "id",
          "invoice_id",
          "proof_status",
          "claimed_amount",
          "payment_purpose",
          "uploaded_at",
          "reviewed_at",
          "reject_reason",
        ],
        "bukti pembayaran",
      );
      return {
        id: uuid(proof.id, "ID bukti"),
        invoice_id: uuid(proof.invoice_id, "ID invoice bukti"),
        proof_status: oneOf(
          proof.proof_status,
          ["pending_review", "verified", "rejected", "expired"] as const,
          "Status bukti",
        ),
        claimed_amount: integer(proof.claimed_amount, "Nominal bukti"),
        payment_purpose: oneOf(proof.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan bukti"),
        uploaded_at: timestamp(proof.uploaded_at, "Waktu unggah"),
        reviewed_at: nullable(proof.reviewed_at, (value) => timestamp(value, "Waktu review")),
        reject_reason: nullable(proof.reject_reason, (value) => text(value, "Alasan penolakan")),
      };
    }),
  };
}

export function parseSafePayment(value: unknown): SafePaymentResult {
  const envelope = object(value, ["data"], "hasil pembayaran");
  const data = object(
    envelope.data,
    ["payment_id", "payment_code", "payment_status", "payment_purpose", "amount", "receipt_id"],
    "hasil pembayaran",
  );
  return {
    payment_id: uuid(data.payment_id, "ID pembayaran"),
    payment_code: text(data.payment_code, "Kode pembayaran"),
    payment_status: oneOf(data.payment_status, W06_PAYMENT_STATUSES, "Status pembayaran"),
    payment_purpose: oneOf(data.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan pembayaran"),
    amount: integer(data.amount, "Nominal pembayaran"),
    receipt_id: nullable(data.receipt_id, (item) => uuid(item, "ID kuitansi")),
  };
}

export function parseBillingReceipt(value: unknown): BillingReceipt {
  const envelope = object(value, ["data"], "kuitansi");
  const receipt = object(
    envelope.data,
    ["id", "receipt_code", "receipt_kind", "amount", "issued_at", "snapshot"],
    "kuitansi",
  );
  const receiptKind = oneOf(
    receipt.receipt_kind,
    ["payment", "reversal"] as const,
    "Jenis kuitansi",
  );
  const receiptCode = text(receipt.receipt_code, "Kode kuitansi");
  const receiptAmount = integer(receipt.amount, "Nominal kuitansi");
  const rawSnapshot = receipt.snapshot;
  if (typeof rawSnapshot !== "object" || rawSnapshot === null || Array.isArray(rawSnapshot))
    throw new Error("Respons snapshot kuitansi tidak valid.");
  const hasDocument = Object.prototype.hasOwnProperty.call(rawSnapshot, "document");
  const snapshot = object(
    rawSnapshot,
    receiptKind === "payment"
      ? hasDocument
        ? [
            "payment_code",
            "payment_method",
            "payment_purpose",
            "lease_id",
            "allocations",
            "document",
          ]
        : ["payment_code", "payment_method", "payment_purpose", "lease_id", "allocations"]
      : Object.prototype.hasOwnProperty.call(rawSnapshot, "source")
        ? ["payment_code", "reason", "source", "document"]
        : ["payment_code", "reason", "document"],
    "snapshot kuitansi",
  );

  let paymentCode: string;
  let paymentMethod: W06PaymentMethod;
  let paymentPurpose: W06PaymentPurpose;
  let leaseId: string | null = null;
  let allocations: BillingAllocation[] = [];

  if (hasDocument) {
    const document = object(
      snapshot.document,
      [
        "receipt_code",
        "receipt_kind",
        "amount",
        "issued_at",
        "payment_code",
        "payment_method",
        "payment_purpose",
        "paid_at",
        "resident_name",
        "room_number",
        "lease_start",
        "lease_end",
        "property_name",
        "property_address",
        "issued_by_name",
        "settles_rent_contract",
        "allocations",
      ],
      "dokumen kuitansi",
    );
    if (!Array.isArray(document.allocations))
      throw new Error("Alokasi dokumen kuitansi tidak valid.");
    if (text(document.receipt_code, "Kode dokumen kuitansi") !== receiptCode)
      throw new Error("Kode dokumen kuitansi tidak konsisten.");
    if (
      oneOf(document.receipt_kind, ["payment", "reversal"] as const, "Jenis dokumen kuitansi") !==
      receiptKind
    )
      throw new Error("Jenis dokumen kuitansi tidak konsisten.");
    if (integer(document.amount, "Nominal dokumen kuitansi") !== receiptAmount)
      throw new Error("Nominal dokumen kuitansi tidak konsisten.");
    timestamp(document.issued_at, "Waktu dokumen kuitansi");
    nullable(document.paid_at, (item) => timestamp(item, "Waktu pembayaran kuitansi"));
    text(document.resident_name, "Nama penghuni kuitansi");
    text(document.room_number, "Nomor kamar kuitansi");
    nullable(document.lease_start, (item) => date(item, "Tanggal mulai sewa kuitansi"));
    nullable(document.lease_end, (item) => date(item, "Tanggal akhir sewa kuitansi"));
    text(document.property_name, "Nama properti kuitansi");
    nullable(document.property_address, (item) => text(item, "Alamat properti kuitansi"));
    nullable(document.issued_by_name, (item) => text(item, "Penerbit kuitansi"));
    flag(document.settles_rent_contract, "Status pelunasan kontrak kuitansi");
    document.allocations.forEach((item) => {
      const documentAllocation = object(
        item,
        ["invoice_code", "amount"],
        "alokasi dokumen kuitansi",
      );
      text(documentAllocation.invoice_code, "Kode invoice dokumen kuitansi");
      integer(documentAllocation.amount, "Nominal alokasi dokumen kuitansi");
    });
    paymentCode = text(document.payment_code, "Kode pembayaran kuitansi");
    paymentMethod = oneOf(document.payment_method, W06_PAYMENT_METHODS, "Metode kuitansi");
    paymentPurpose = oneOf(document.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan kuitansi");
    if (receiptKind === "payment") {
      leaseId = uuid(snapshot.lease_id, "ID kontrak kuitansi");
      if (!Array.isArray(snapshot.allocations)) throw new Error("Alokasi kuitansi tidak valid.");
      allocations = snapshot.allocations.map(allocation);
    }
  } else {
    if (!Array.isArray(snapshot.allocations)) throw new Error("Alokasi kuitansi tidak valid.");
    paymentCode = text(snapshot.payment_code, "Kode pembayaran kuitansi");
    paymentMethod = oneOf(snapshot.payment_method, W06_PAYMENT_METHODS, "Metode kuitansi");
    paymentPurpose = oneOf(snapshot.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan kuitansi");
    leaseId = uuid(snapshot.lease_id, "ID kontrak kuitansi");
    allocations = snapshot.allocations.map(allocation);
  }
  return {
    id: uuid(receipt.id, "ID kuitansi"),
    receipt_code: receiptCode,
    receipt_kind: receiptKind,
    amount: receiptAmount,
    issued_at: timestamp(receipt.issued_at, "Waktu kuitansi"),
    snapshot: {
      payment_code: paymentCode,
      payment_method: paymentMethod,
      payment_purpose: paymentPurpose,
      lease_id: leaseId,
      allocations,
    },
  };
}

function simplePage<T>(value: unknown, parse: (item: unknown) => T, label: string): BillingPage<T> {
  const record = object(value, ["data", "meta"], label);
  if (!Array.isArray(record.data)) throw new Error(`${label} tidak valid.`);
  const meta = object(record.meta, ["limit", "offset", "total"], `paginasi ${label}`);
  return {
    data: record.data.map(parse),
    meta: {
      limit: integer(meta.limit, "Batas halaman"),
      offset: integer(meta.offset, "Offset halaman"),
      total: integer(meta.total, "Total data"),
    },
  };
}

export function parseBillingPayments(value: unknown): BillingPage<BillingWorkspacePayment> {
  return simplePage(value, workspacePayment, "daftar pembayaran");
}

export function parseBillingProofs(value: unknown): BillingPage<BillingProof> {
  return simplePage(
    value,
    (item) => {
      const proof = object(
        item,
        [
          "id",
          "invoice_id",
          "invoice_code",
          "resident_id",
          "resident_name",
          "room_number",
          "proof_status",
          "claimed_amount",
          "payment_purpose",
          "uploaded_at",
          "reviewed_at",
          "reject_reason",
          "notes",
          "evidence",
        ],
        "bukti pembayaran",
      );
      if (!Array.isArray(proof.evidence)) throw new Error("Bukti pembayaran tidak valid.");
      return {
        id: uuid(proof.id, "ID bukti"),
        invoice_id: uuid(proof.invoice_id, "ID invoice"),
        invoice_code: text(proof.invoice_code, "Kode invoice"),
        resident_id: uuid(proof.resident_id, "ID penghuni"),
        resident_name: text(proof.resident_name, "Nama penghuni"),
        room_number: text(proof.room_number, "Nomor kamar"),
        proof_status: oneOf(
          proof.proof_status,
          ["pending_review", "verified", "rejected", "expired"] as const,
          "Status bukti",
        ),
        claimed_amount: integer(proof.claimed_amount, "Nominal bukti"),
        payment_purpose: oneOf(proof.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan bukti"),
        uploaded_at: timestamp(proof.uploaded_at, "Waktu unggah"),
        reviewed_at: nullable(proof.reviewed_at, (value) => timestamp(value, "Waktu review")),
        reject_reason: nullable(proof.reject_reason, (value) => text(value, "Alasan penolakan")),
        notes: nullable(proof.notes, (value) => text(value, "Catatan")),
        evidence: proof.evidence.map((item) => {
          const file = object(
            item,
            ["id", "original_filename", "mime_type", "file_size_bytes", "content_path"],
            "file bukti",
          );
          const id = uuid(file.id, "ID file");
          const contentPath = text(file.content_path, "Akses file");
          if (contentPath !== `/files/${id}/content`)
            throw new Error("Akses file bukti tidak valid.");
          return {
            id,
            original_filename: text(file.original_filename, "Nama file"),
            mime_type: oneOf(
              file.mime_type,
              ["image/jpeg", "image/png", "application/pdf"] as const,
              "MIME file",
            ),
            file_size_bytes: integer(file.file_size_bytes, "Ukuran file"),
            content_path: contentPath,
          };
        }),
      };
    },
    "daftar bukti pembayaran",
  );
}

export function canManageW06Billing(access: {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
}) {
  return Boolean(
    access.roles?.some((role) => role === "owner" || role === "manager") &&
    access.permissions?.includes("billing.manage"),
  );
}
export function canVerifyW06Payment(access: {
  roles?: readonly RoleCode[];
  permissions?: readonly string[];
}) {
  return Boolean(
    access.roles?.some((role) => ["owner", "manager", "admin"].includes(role)) &&
    access.permissions?.includes("payment.verify"),
  );
}

export async function getBillingWorklist(
  input: {
    propertyId: string;
    month: string;
    limit?: number;
    offset?: number;
    search?: string;
    status?: Exclude<W06InvoiceStatus, "draft" | "paid" | "void">;
    sort?: "due_date_asc" | "due_date_desc" | "resident_asc";
    dueWithinDays?: number;
    dateFrom?: string;
    dateTo?: string;
  },
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseBillingWorklist(
    await requester.get<unknown>("/admin/billing/current", {
      query: {
        property_id: input.propertyId,
        month: input.month,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        search: input.search,
        ...(input.status ? { status: input.status } : {}),
        ...(input.sort ? { sort: input.sort } : {}),
        ...(input.dueWithinDays !== undefined ? { due_within_days: input.dueWithinDays } : {}),
        ...(input.dateFrom ? { date_from: input.dateFrom } : {}),
        ...(input.dateTo ? { date_to: input.dateTo } : {}),
      },
      signal,
    }),
  );
}

export async function getBillingDocuments(
  input: { propertyId: string; q: string; limit?: number; offset?: number },
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseBillingDocumentSearch(
    await requester.get<unknown>("/admin/billing/documents/search", {
      query: {
        property_id: input.propertyId,
        q: input.q,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
      },
      signal,
    }),
  );
}

export async function getResidentBilling(
  propertyId: string,
  residentId: string,
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseResidentBilling(
    await requester.get<unknown>(`/admin/billing/residents/${encodeURIComponent(residentId)}`, {
      query: { property_id: propertyId },
      signal,
    }),
  );
}
export async function getBillingPayments(
  input: {
    propertyId: string;
    status?: W06PaymentStatus;
    limit?: number;
    offset?: number;
    search?: string;
    method?: W06PaymentMethod;
    purpose?: W06PaymentPurpose;
    dueWithinDays?: number;
    dateFrom?: string;
    dateTo?: string;
  },
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseBillingPayments(
    await requester.get<unknown>("/admin/billing/payments", {
      query: {
        property_id: input.propertyId,
        status: input.status,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
        ...(input.search ? { search: input.search } : {}),
        ...(input.method ? { method: input.method } : {}),
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.dueWithinDays !== undefined ? { due_within_days: input.dueWithinDays } : {}),
        ...(input.dateFrom ? { date_from: input.dateFrom } : {}),
        ...(input.dateTo ? { date_to: input.dateTo } : {}),
      },
      signal,
    }),
  );
}
export async function getBillingProofs(
  input: {
    propertyId: string;
    status?: BillingProof["proof_status"];
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseBillingProofs(
    await requester.get<unknown>("/admin/billing/payment-proofs", {
      query: {
        property_id: input.propertyId,
        status: input.status,
        limit: input.limit ?? 20,
        offset: input.offset ?? 0,
      },
      signal,
    }),
  );
}
export async function getBillingReceipt(
  propertyId: string,
  receiptId: string,
  signal?: AbortSignal,
  requester: Requester = adminUxV2Requester,
) {
  return parseBillingReceipt(
    await requester.get<unknown>(`/admin/billing/receipts/${encodeURIComponent(receiptId)}`, {
      query: { property_id: propertyId },
      signal,
    }),
  );
}
export async function recordManualPayment(
  input: ManualPaymentInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return parseSafePayment(
    await requester.post<unknown>("/admin/billing/payments/manual", input, { idempotencyKey }),
  );
}
export async function verifyPayment(
  propertyId: string,
  paymentId: string,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return parseSafePayment(
    await requester.post<unknown>(
      `/admin/billing/payments/${encodeURIComponent(paymentId)}/verify`,
      { property_id: propertyId },
      { idempotencyKey },
    ),
  );
}
export async function rejectPayment(
  propertyId: string,
  paymentId: string,
  reason: string,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return parseSafePayment(
    await requester.post<unknown>(
      "/admin/billing/payments/" + encodeURIComponent(paymentId) + "/reject",
      { property_id: propertyId, reason },
      { idempotencyKey },
    ),
  );
}
export async function verifyProof(
  propertyId: string,
  proofId: string,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return parseSafePayment(
    await requester.post<unknown>(
      `/admin/billing/payment-proofs/${encodeURIComponent(proofId)}/verify`,
      { property_id: propertyId },
      { idempotencyKey },
    ),
  );
}
export async function rejectProof(
  propertyId: string,
  proofId: string,
  reason: string,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/payment-proofs/${encodeURIComponent(proofId)}/reject`,
    { property_id: propertyId, reason },
    { idempotencyKey },
  );
}
export async function reversePayment(
  propertyId: string,
  paymentId: string,
  reason: string,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/payments/${encodeURIComponent(paymentId)}/reverse`,
    { property_id: propertyId, reason },
    { idempotencyKey },
  );
}
export async function createOtherCharge(
  input: OtherChargeInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>("/admin/billing/other-charges", input, { idempotencyKey });
}

export async function extendContractSettlement(
  leaseId: string,
  input: ContractSettlementExtensionInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/leases/${encodeURIComponent(leaseId)}/contract-settlement/extend`,
    input,
    { idempotencyKey },
  );
}

export async function recordLeasePaymentPromise(
  leaseId: string,
  input: LeasePaymentPromiseInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/leases/${encodeURIComponent(leaseId)}/contract-settlement/payment-promise`,
    input,
    { idempotencyKey },
  );
}

export async function startLeaseTermination(
  leaseId: string,
  input: StartLeaseTerminationInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/leases/${encodeURIComponent(leaseId)}/contract-settlement/termination`,
    input,
    { idempotencyKey },
  );
}

export async function cancelLeaseTermination(
  leaseId: string,
  input: CancelLeaseTerminationInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/leases/${encodeURIComponent(leaseId)}/contract-settlement/termination/cancel`,
    input,
    { idempotencyKey },
  );
}

export async function finalizeLeaseTermination(
  leaseId: string,
  input: FinalizeLeaseTerminationInput,
  idempotencyKey: string,
  requester: Requester = adminUxV2Requester,
) {
  return requester.post<unknown>(
    `/admin/billing/leases/${encodeURIComponent(leaseId)}/contract-settlement/termination/finalize`,
    input,
    { idempotencyKey },
  );
}

export async function downloadAdminInvoiceDocument(
  propertyId: string,
  invoiceId: string,
  invoiceCode: string,
) {
  const query = new URLSearchParams({ property_id: propertyId });
  const filename = `${invoiceCode.replace(/[^a-z0-9_-]+/gi, "-") || "invoice"}.pdf`;
  await fetchPreviewAndDownload(async () => {
    const token = getAccessToken();
    const response = await fetch(
      `${env.VITE_API_BASE_URL}/admin/billing/invoices/${encodeURIComponent(invoiceId)}/document?${query}`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/pdf")
      throw new Error(`Dokumen invoice gagal diunduh (HTTP ${response.status}).`);
    return response;
  }, filename);
}

export async function downloadAdminReceiptDocument(
  propertyId: string,
  receiptId: string,
  receiptCode: string,
) {
  const query = new URLSearchParams({ property_id: propertyId });
  const filename = `${receiptCode.replace(/[^a-z0-9_-]+/gi, "-") || "kuitansi"}.pdf`;
  await fetchPreviewAndDownload(async () => {
    const token = getAccessToken();
    const response = await fetch(
      `${env.VITE_API_BASE_URL}/admin/billing/receipts/${encodeURIComponent(receiptId)}/document?${query}`,
      {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/pdf")
      throw new Error(`Dokumen kuitansi gagal diunduh (HTTP ${response.status}).`);
    return response;
  }, filename);
}
