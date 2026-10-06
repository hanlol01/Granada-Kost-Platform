import { apiClient, getAccessToken } from "@/lib/api";
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
export const W06_PAYMENT_PURPOSES = [
  "rent",
  "dp",
  "booking_fee",
  "down_payment",
  "full_settlement",
  "security_deposit",
  "other_charge",
  "management_fee",
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
export type W06ProofStatus = "pending_review" | "verified" | "rejected" | "expired";

export type MyBillingEvidence = {
  id: string;
  original_filename: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  file_size_bytes: number;
  availability: "available" | "purged" | "purge_pending" | "unavailable";
  purged_at: string | null;
  content_path: string | null;
};

export type MyW06ContractSettlement = {
  id: string;
  invoice_id: string;
  policy_version:
    | "legacy_v1"
    | "lease_settlement_v2"
    | "lease_settlement_v3"
    | "lease_settlement_v4";
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
  final_settlement_due_at: string | null;
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
};

export type MyW06Billing = {
  lease: {
    service_period_pending?: boolean;
    term_months?: number | null;
    id: string;
    property_id: string;
    resident_name?: string;
    room_number?: string;
    status: "awaiting_activation" | "active" | "ended" | "cancelled";
    commercial_mode?: "rent" | "owner_sponsored";
    start_date: string;
    end_date: string;
    payment_plan: "annual_full" | "monthly_installments" | "two_month_installments";
    contract_rent: number;
    monthly_rate: number;
    pricing_source: "standard" | "negotiated" | "owner_sponsored";
    remaining_days: number;
    note: string;
  };
  summary: {
    rent_invoiced: number;
    rent_paid: number;
    rent_outstanding: number;
    security_deposit_required: number;
    security_deposit_target?: number;
    deposit_collected: number;
    deposit_deducted: number;
    deposit_refunded: number;
    deposit_balance: number;
    installment_paid: number;
    installment_total: number;
    next_due_date: string | null;
    overdue_count: number;
  };
  contract_settlement: MyW06ContractSettlement | null;
  owner_sponsorship?: {
    owner_profile_id: string;
    owner_name: string;
    management_fee_mode: "charged" | "waived";
    management_fee_payer: "resident" | "owner" | "other" | null;
    management_fee_payer_name: string | null;
    sponsorship_reason: string;
    snapshot_monthly_management_fee: number;
    projected_management_fee: number;
    verified_paid: number;
    pending: number;
    remaining: number;
    payment_status: "paid" | "partially_paid" | "overpaid" | "unpaid" | "waived";
    payment_timing: "flexible";
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
  payments: Array<{
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
    reversal_receipt_id?: string | null;
    reversal_reason?: string | null;
    reversed_at?: string | null;
    allocations: Array<{ invoice_id: string; amount: number }>;
    evidence?: MyBillingEvidence[];
  }>;
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
    document_code: string;
    document_kind: "checkout_handover" | "final_settlement" | "refund_receipt";
    issued_at: string;
  }>;
  proofs: Array<{
    id: string;
    invoice_id: string;
    proof_status: W06ProofStatus;
    claimed_amount: number;
    payment_purpose: W06PaymentPurpose;
    uploaded_at: string;
    reviewed_at: string | null;
    reject_reason: string | null;
    evidence?: MyBillingEvidence[];
  }>;
};

export type MyBillingHistory = {
  items: Array<{
    id: string;
    lease_code: string;
    room_number: string;
    status: "cancelled" | "ended";
    term_months: number;
    start_date: string | null;
    end_date: string | null;
    closed_at: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
};

export type MyW06Receipt = {
  id: string;
  receipt_code: string;
  receipt_kind: "payment";
  amount: number;
  issued_at: string;
  snapshot: {
    payment_code: string;
    payment_method: W06PaymentMethod;
    payment_purpose: W06PaymentPurpose;
    lease_id: string;
    allocations: Array<{ invoice_id: string; amount: number }>;
  };
};

export type SubmitMyW06Proof = {
  invoice_id: string;
  claimed_amount: number;
  payment_method: "bank_transfer";
  payment_purpose: W06PaymentPurpose;
  notes?: string;
  file_ids: string[];
};

export type SubmittedMyW06Proof = {
  id: string;
  invoice_id: string;
  proof_status: "pending_review";
  claimed_amount: number;
  payment_purpose: W06PaymentPurpose;
  uploaded_at: string;
};

type Requester = {
  get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T>;
  post<T>(path: string, body: unknown, options?: { idempotencyKey?: string }): Promise<T>;
};

function asEnvelope(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "data")
  ) {
    return value;
  }
  return { data: value };
}

function fail(label: string): never {
  throw new Error(`${label} tidak valid.`);
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail(label);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    return fail(label);
  return record;
}

function objectWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail(label);
  const record = value as Record<string, unknown>;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const actual = Object.keys(record);
  if (requiredKeys.some((key) => !(key in record)) || actual.some((key) => !allowed.has(key)))
    return fail(label);
  return record;
}

function list<T>(value: unknown, parser: (item: unknown) => T, label: string): T[] {
  if (!Array.isArray(value)) return fail(label);
  return value.map(parser);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(label);
  return value;
}

function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))
    return fail(label);
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) return fail(label);
  return Number(value);
}

function date(value: unknown, label: string): string {
  const result = text(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) return fail(label);
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  )
    return fail(label);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(result))
    return fail(label);
  if (!Number.isFinite(Date.parse(result))) return fail(label);
  return result;
}

function nullable<T>(value: unknown, parser: (item: unknown) => T): T | null {
  return value === null ? null : parser(value);
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) return fail(label);
  return value as T[number];
}

function allocation(value: unknown) {
  const item = object(value, ["invoice_id", "amount"], "Alokasi pembayaran");
  return {
    invoice_id: uuid(item.invoice_id, "ID invoice alokasi"),
    amount: integer(item.amount, "Nominal alokasi"),
  };
}

function billingEvidence(value: unknown, leaseId: string): MyBillingEvidence {
  const item = object(
    value,
    [
      "id",
      "original_filename",
      "mime_type",
      "file_size_bytes",
      "availability",
      "purged_at",
      "content_path",
    ],
    "Berkas bukti pembayaran",
  );
  const id = uuid(item.id, "ID berkas bukti");
  const availability = oneOf(
    item.availability,
    ["available", "purged", "purge_pending", "unavailable"] as const,
    "Ketersediaan bukti",
  );
  const path = `/my/billing/${leaseId}/evidence/${id}/content`;
  if (item.content_path !== (availability === "available" ? path : null))
    throw new Error("Alamat bukti pembayaran tidak sesuai penyewaan atau ketersediaannya.");
  const purgedAt = nullable(item.purged_at, (entry) => timestamp(entry, "Waktu penghapusan bukti"));
  if ((availability === "purged") !== Boolean(purgedAt))
    throw new Error("Catatan penghapusan bukti belum dapat dipastikan.");
  return {
    id,
    original_filename: text(item.original_filename, "Nama berkas bukti"),
    mime_type: oneOf(
      item.mime_type,
      ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const,
      "Jenis berkas bukti",
    ),
    file_size_bytes: integer(item.file_size_bytes, "Ukuran berkas bukti"),
    availability,
    purged_at: purgedAt,
    content_path: availability === "available" ? path : null,
  };
}

function payment(value: unknown, leaseId: string): MyW06Billing["payments"][number] {
  const item = objectWithOptional(
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
      "allocations",
    ],
    ["reversal_receipt_id", "reversal_reason", "reversed_at", "evidence"],
    "Pembayaran",
  );
  return {
    id: uuid(item.id, "ID pembayaran"),
    payment_code: text(item.payment_code, "Kode pembayaran"),
    payment_method: oneOf(item.payment_method, W06_PAYMENT_METHODS, "Metode pembayaran"),
    payment_status: oneOf(item.payment_status, W06_PAYMENT_STATUSES, "Status pembayaran"),
    payment_purpose: nullable(item.payment_purpose, (entry) =>
      oneOf(entry, W06_PAYMENT_PURPOSES, "Tujuan pembayaran"),
    ),
    amount: integer(item.amount, "Nominal pembayaran"),
    paid_at: nullable(item.paid_at, (entry) => timestamp(entry, "Tanggal pembayaran")),
    verified_at: nullable(item.verified_at, (entry) => timestamp(entry, "Tanggal verifikasi")),
    reversal_id: nullable(item.reversal_id, (entry) => uuid(entry, "ID reversal")),
    receipt_id: nullable(item.receipt_id, (entry) => uuid(entry, "ID kuitansi")),
    reversal_receipt_id:
      item.reversal_receipt_id === undefined
        ? undefined
        : nullable(item.reversal_receipt_id, (entry) => uuid(entry, "ID kuitansi pembalikan")),
    reversal_reason:
      item.reversal_reason === undefined
        ? undefined
        : nullable(item.reversal_reason, (entry) => text(entry, "Alasan pembalikan")),
    reversed_at:
      item.reversed_at === undefined
        ? undefined
        : nullable(item.reversed_at, (entry) => timestamp(entry, "Tanggal pembalikan")),
    allocations: list(item.allocations, allocation, "Alokasi pembayaran"),
    evidence:
      item.evidence === undefined
        ? undefined
        : list(item.evidence, (entry) => billingEvidence(entry, leaseId), "Berkas pembayaran"),
  };
}

function contractSettlement(value: unknown): MyW06ContractSettlement {
  const record = objectWithOptional(
    value,
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
    ["final_settlement_due_at", "payment_promise_history", "extension_history"],
    "Pelunasan kontrak",
  );
  const checkpoint = object(
    record.first_payment_checkpoint,
    [
      "due_at",
      "required_additional_amount",
      "additional_payment_received",
      "remaining_amount",
      "status",
    ],
    "Ringkasan pembayaran kontrak",
  );
  const terminationCase = nullable(record.termination_case, (entry) => {
    const termination = object(entry, ["id", "status", "planned_checkout_date"], "Proses checkout");
    return {
      id: uuid(termination.id, "ID proses checkout"),
      status: oneOf(
        termination.status,
        ["pending", "cancelled", "checked_out"] as const,
        "Status proses checkout",
      ),
      planned_checkout_date: date(termination.planned_checkout_date, "Tanggal checkout"),
    };
  });
  const paymentPromise = nullable(record.payment_promise, (entry) => {
    const promise = object(
      entry,
      ["id", "promised_amount", "promised_payment_date", "note", "recorded_at"],
      "Janji bayar",
    );
    return {
      id: uuid(promise.id, "ID janji bayar"),
      promised_amount: integer(promise.promised_amount, "Nominal janji bayar"),
      promised_payment_date: date(promise.promised_payment_date, "Tanggal janji bayar"),
      note: text(promise.note, "Catatan janji bayar"),
      recorded_at: timestamp(promise.recorded_at, "Waktu pencatatan janji bayar"),
    };
  });
  const boolean = (entry: unknown, label: string) => {
    if (typeof entry !== "boolean") return fail(label);
    return entry;
  };
  return {
    id: uuid(record.id, "ID pelunasan kontrak"),
    invoice_id: uuid(record.invoice_id, "ID invoice pelunasan kontrak"),
    policy_version: oneOf(
      record.policy_version,
      ["legacy_v1", "lease_settlement_v2", "lease_settlement_v3", "lease_settlement_v4"] as const,
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
    activated_at: nullable(record.activated_at, (entry) => timestamp(entry, "Waktu aktivasi")),
    original_due_at: nullable(record.original_due_at, (entry) => timestamp(entry, "Tenggat awal")),
    extension_due_at: nullable(record.extension_due_at, (entry) =>
      timestamp(entry, "Tenggat perpanjangan"),
    ),
    extension_reason: nullable(record.extension_reason, (entry) =>
      text(entry, "Alasan perpanjangan"),
    ),
    effective_due_at: nullable(record.effective_due_at, (entry) =>
      timestamp(entry, "Tenggat efektif"),
    ),
    final_settlement_due_at:
      record.final_settlement_due_at === undefined
        ? null
        : nullable(record.final_settlement_due_at, (entry) =>
            timestamp(entry, "Batas pelunasan kontrak"),
          ),
    contract_rent_amount: integer(record.contract_rent_amount, "Total sewa kontrak"),
    initial_rent_credit: integer(record.initial_rent_credit, "Kredit sewa awal"),
    payment_allocated: integer(record.payment_allocated, "Pembayaran sewa"),
    first_payment_checkpoint: {
      due_at: nullable(checkpoint.due_at, (entry) => timestamp(entry, "Tenggat pembayaran")),
      required_additional_amount: integer(
        checkpoint.required_additional_amount,
        "Minimum pembayaran",
      ),
      additional_payment_received: integer(
        checkpoint.additional_payment_received,
        "Pembayaran tercatat",
      ),
      remaining_amount: integer(checkpoint.remaining_amount, "Sisa pembayaran"),
      status: oneOf(
        checkpoint.status,
        ["not_required", "pending", "met_early", "met", "overdue"] as const,
        "Status pembayaran",
      ),
    },
    deposit_offset_amount: integer(record.deposit_offset_amount, "Potongan deposit"),
    outstanding_amount: integer(record.outstanding_amount, "Saldo sewa kontrak"),
    checkpoint_shortfall_amount: integer(
      record.checkpoint_shortfall_amount,
      "Kekurangan pembayaran",
    ),
    reminder_stage: nullable(record.reminder_stage, (entry) =>
      oneOf(
        entry,
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
}

export function parseMyW06Billing(value: unknown): MyW06Billing {
  const envelope = object(value, ["data"], "Respons billing");
  const data = objectWithOptional(
    envelope.data,
    ["lease", "summary", "invoices", "payments", "financial_timeline", "exit_documents", "proofs"],
    ["contract_settlement", "owner_sponsorship"],
    "Data billing",
  );
  const lease = objectWithOptional(
    data.lease,
    [
      "id",
      "property_id",
      "status",
      "start_date",
      "end_date",
      "payment_plan",
      "contract_rent",
      "monthly_rate",
      "pricing_source",
      "remaining_days",
      "note",
    ],
    ["resident_name", "room_number", "service_period_pending", "term_months", "commercial_mode"],
    "Kontrak billing",
  );
  const summary = objectWithOptional(
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
    ["security_deposit_target"],
    "Ringkasan billing",
  );
  const settlement =
    data.contract_settlement === undefined
      ? null
      : nullable(data.contract_settlement, contractSettlement);
  return {
    lease: {
      id: uuid(lease.id, "ID kontrak"),
      property_id: uuid(lease.property_id, "ID properti"),
      resident_name:
        lease.resident_name === undefined ? undefined : text(lease.resident_name, "Nama penghuni"),
      room_number:
        lease.room_number === undefined ? undefined : text(lease.room_number, "Nomor kamar"),
      status: oneOf(
        lease.status,
        ["awaiting_activation", "active", "ended", "cancelled"] as const,
        "Status kontrak",
      ),
      start_date: date(lease.start_date, "Mulai kontrak"),
      end_date: date(lease.end_date, "Akhir kontrak"),
      service_period_pending: lease.service_period_pending === true,
      term_months: lease.term_months == null ? null : integer(lease.term_months, "Durasi kontrak"),
      commercial_mode:
        lease.commercial_mode === undefined
          ? undefined
          : oneOf(lease.commercial_mode, ["rent", "owner_sponsored"] as const, "Jenis hunian"),
      payment_plan: oneOf(
        lease.payment_plan,
        ["annual_full", "monthly_installments", "two_month_installments"] as const,
        "Paket pembayaran",
      ),
      contract_rent: integer(lease.contract_rent, "Nilai kontrak"),
      monthly_rate: integer(lease.monthly_rate, "Tarif bulanan"),
      pricing_source: oneOf(
        lease.pricing_source,
        ["standard", "negotiated", "owner_sponsored"] as const,
        "Sumber tarif",
      ),
      remaining_days: integer(lease.remaining_days, "Sisa hari"),
      note: text(lease.note, "Catatan kontrak"),
    },
    summary: {
      rent_invoiced: integer(summary.rent_invoiced, "Total sewa"),
      rent_paid: integer(summary.rent_paid, "Sewa dibayar"),
      rent_outstanding: integer(summary.rent_outstanding, "Sisa sewa"),
      security_deposit_required: integer(summary.security_deposit_required, "Deposit wajib"),
      security_deposit_target:
        summary.security_deposit_target === undefined
          ? undefined
          : integer(summary.security_deposit_target, "Target deposit"),
      deposit_collected: integer(summary.deposit_collected, "Deposit terkumpul"),
      deposit_deducted: integer(summary.deposit_deducted, "Deposit dipotong"),
      deposit_refunded: integer(summary.deposit_refunded, "Deposit dikembalikan"),
      deposit_balance: integer(summary.deposit_balance, "Saldo deposit"),
      installment_paid: integer(summary.installment_paid, "Angsuran lunas"),
      installment_total: integer(summary.installment_total, "Total angsuran"),
      next_due_date: nullable(summary.next_due_date, (entry) =>
        date(entry, "Jatuh tempo berikutnya"),
      ),
      overdue_count: integer(summary.overdue_count, "Jumlah terlambat"),
    },
    contract_settlement: settlement,
    owner_sponsorship:
      data.owner_sponsorship === undefined
        ? undefined
        : nullable(data.owner_sponsorship, ownerSponsorship),
    invoices: list(
      data.invoices,
      (value) => {
        const invoice = object(
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
          "Invoice",
        );
        return {
          id: uuid(invoice.id, "ID invoice"),
          invoice_code: text(invoice.invoice_code, "Kode invoice"),
          invoice_status: oneOf(invoice.invoice_status, W06_INVOICE_STATUSES, "Status invoice"),
          invoice_purpose: oneOf(
            invoice.invoice_purpose,
            ["rent", "other_charge"] as const,
            "Tujuan invoice",
          ),
          total_amount: integer(invoice.total_amount, "Total invoice"),
          outstanding_amount: integer(invoice.outstanding_amount, "Sisa invoice"),
          due_date: date(invoice.due_date, "Jatuh tempo invoice"),
          coverage_start: date(invoice.coverage_start, "Awal periode"),
          coverage_end: date(invoice.coverage_end, "Akhir periode"),
        };
      },
      "Daftar invoice",
    ),
    payments: list(
      data.payments,
      (value) => payment(value, uuid(lease.id, "ID kontrak")),
      "Daftar pembayaran",
    ),
    financial_timeline: list(
      data.financial_timeline,
      (value) => {
        const event = object(
          value,
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
          "Peristiwa finansial",
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
          reference: nullable(event.reference, (entry) => text(entry, "Referensi finansial")),
          subtype: nullable(event.subtype, (entry) => text(entry, "Subjenis finansial")),
          source: text(event.source, "Sumber peristiwa finansial"),
          note: nullable(event.note, (entry) => text(entry, "Catatan peristiwa finansial")),
          actor_name: text(event.actor_name, "Pencatat peristiwa finansial"),
          receipt_id: nullable(event.receipt_id, (entry) => uuid(entry, "ID kuitansi finansial")),
          exit_document_id: nullable(event.exit_document_id, (entry) =>
            uuid(entry, "ID dokumen checkout finansial"),
          ),
        };
      },
      "Timeline finansial",
    ),
    exit_documents: list(
      data.exit_documents,
      (value) => {
        const document = object(
          value,
          ["id", "document_code", "document_kind", "issued_at"],
          "Dokumen checkout",
        );
        return {
          id: uuid(document.id, "ID dokumen checkout"),
          document_code: text(document.document_code, "Kode dokumen checkout"),
          document_kind: oneOf(
            document.document_kind,
            ["checkout_handover", "final_settlement", "refund_receipt"] as const,
            "Jenis dokumen checkout",
          ),
          issued_at: timestamp(document.issued_at, "Waktu dokumen checkout"),
        };
      },
      "Daftar dokumen checkout",
    ),
    proofs: list(
      data.proofs,
      (value) => {
        const proof = objectWithOptional(
          value,
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
          ["evidence"],
          "Bukti pembayaran",
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
          reviewed_at: nullable(proof.reviewed_at, (entry) => timestamp(entry, "Waktu review")),
          reject_reason: nullable(proof.reject_reason, (entry) => text(entry, "Alasan penolakan")),
          evidence:
            proof.evidence === undefined
              ? undefined
              : list(
                  proof.evidence,
                  (entry) => billingEvidence(entry, uuid(lease.id, "ID kontrak")),
                  "Berkas bukti",
                ),
        };
      },
      "Daftar bukti",
    ),
  };
}

function ownerSponsorship(value: unknown): NonNullable<MyW06Billing["owner_sponsorship"]> {
  const item = object(
    value,
    [
      "owner_profile_id",
      "owner_name",
      "management_fee_mode",
      "management_fee_payer",
      "management_fee_payer_name",
      "sponsorship_reason",
      "snapshot_monthly_management_fee",
      "projected_management_fee",
      "verified_paid",
      "pending",
      "remaining",
      "payment_status",
      "payment_timing",
    ],
    "Hunian tanggungan Owner",
  );
  return {
    owner_profile_id: uuid(item.owner_profile_id, "ID Owner"),
    owner_name: text(item.owner_name, "Nama Owner"),
    management_fee_mode: oneOf(
      item.management_fee_mode,
      ["charged", "waived"] as const,
      "Ketentuan biaya pengelolaan",
    ),
    management_fee_payer: nullable(item.management_fee_payer, (entry) =>
      oneOf(entry, ["resident", "owner", "other"] as const, "Penanggung biaya"),
    ),
    management_fee_payer_name: nullable(item.management_fee_payer_name, (entry) =>
      text(entry, "Nama penanggung biaya"),
    ),
    sponsorship_reason: text(item.sponsorship_reason, "Catatan pengelolaan"),
    snapshot_monthly_management_fee: integer(
      item.snapshot_monthly_management_fee,
      "Biaya pengelolaan bulanan",
    ),
    projected_management_fee: integer(item.projected_management_fee, "Total biaya pengelolaan"),
    verified_paid: integer(item.verified_paid, "Pembayaran terverifikasi"),
    pending: integer(item.pending, "Pembayaran menunggu"),
    remaining: integer(item.remaining, "Sisa biaya pengelolaan"),
    payment_status: oneOf(
      item.payment_status,
      ["paid", "partially_paid", "overpaid", "unpaid", "waived"] as const,
      "Status biaya pengelolaan",
    ),
    payment_timing: oneOf(item.payment_timing, ["flexible"] as const, "Jadwal biaya pengelolaan"),
  };
}

export function parseMyBillingHistory(value: unknown): MyBillingHistory {
  const envelope = object(value, ["data"], "Respons riwayat penyewaan");
  const data = object(envelope.data, ["items", "total", "limit", "offset"], "Riwayat penyewaan");
  return {
    items: list(
      data.items,
      (value) => {
        const item = object(
          value,
          [
            "id",
            "lease_code",
            "room_number",
            "status",
            "term_months",
            "start_date",
            "end_date",
            "closed_at",
          ],
          "Penyewaan historis",
        );
        return {
          id: uuid(item.id, "ID penyewaan"),
          lease_code: text(item.lease_code, "Kode penyewaan"),
          room_number: text(item.room_number, "Nomor kamar"),
          status: oneOf(item.status, ["cancelled", "ended"] as const, "Status penyewaan"),
          term_months: integer(item.term_months, "Durasi sewa"),
          start_date: nullable(item.start_date, (entry) => date(entry, "Awal sewa")),
          end_date: nullable(item.end_date, (entry) => date(entry, "Akhir sewa")),
          closed_at: nullable(item.closed_at, (entry) => timestamp(entry, "Tanggal selesai")),
        };
      },
      "Daftar riwayat penyewaan",
    ),
    total: integer(data.total, "Jumlah penyewaan"),
    limit: integer(data.limit, "Batas halaman"),
    offset: integer(data.offset, "Awal halaman"),
  };
}

export async function getMyBillingHistory(
  offset = 0,
  signal?: AbortSignal,
  requester: Requester = apiClient,
) {
  return parseMyBillingHistory(
    asEnvelope(
      await requester.get<unknown>(`/my/billing/history?limit=20&offset=${offset}`, { signal }),
    ),
  );
}

export async function getMyHistoricalBilling(
  leaseId: string,
  signal?: AbortSignal,
  requester: Requester = apiClient,
) {
  return parseMyW06Billing(
    asEnvelope(
      await requester.get<unknown>(`/my/billing/history/${encodeURIComponent(leaseId)}`, {
        signal,
      }),
    ),
  );
}

export function parseSubmittedMyW06Proof(value: unknown): SubmittedMyW06Proof {
  const envelope = object(value, ["data"], "Respons bukti");
  const proof = object(
    envelope.data,
    ["id", "invoice_id", "proof_status", "claimed_amount", "payment_purpose", "uploaded_at"],
    "Bukti terkirim",
  );
  return {
    id: uuid(proof.id, "ID bukti"),
    invoice_id: uuid(proof.invoice_id, "ID invoice bukti"),
    proof_status: oneOf(proof.proof_status, ["pending_review"] as const, "Status bukti"),
    claimed_amount: integer(proof.claimed_amount, "Nominal bukti"),
    payment_purpose: oneOf(proof.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan bukti"),
    uploaded_at: timestamp(proof.uploaded_at, "Waktu unggah"),
  };
}

export function parseMyW06Receipt(value: unknown): MyW06Receipt {
  const envelope = object(value, ["data"], "Respons kuitansi");
  const receipt = object(
    envelope.data,
    ["id", "receipt_code", "receipt_kind", "amount", "issued_at", "snapshot"],
    "Kuitansi",
  );
  const snapshot = object(
    receipt.snapshot,
    ["payment_code", "payment_method", "payment_purpose", "lease_id", "allocations"],
    "Snapshot kuitansi",
  );
  return {
    id: uuid(receipt.id, "ID kuitansi"),
    receipt_code: text(receipt.receipt_code, "Kode kuitansi"),
    receipt_kind: oneOf(receipt.receipt_kind, ["payment"] as const, "Jenis kuitansi"),
    amount: integer(receipt.amount, "Nominal kuitansi"),
    issued_at: timestamp(receipt.issued_at, "Waktu kuitansi"),
    snapshot: {
      payment_code: text(snapshot.payment_code, "Kode pembayaran kuitansi"),
      payment_method: oneOf(snapshot.payment_method, W06_PAYMENT_METHODS, "Metode kuitansi"),
      payment_purpose: oneOf(snapshot.payment_purpose, W06_PAYMENT_PURPOSES, "Tujuan kuitansi"),
      lease_id: uuid(snapshot.lease_id, "ID kontrak kuitansi"),
      allocations: list(snapshot.allocations, allocation, "Alokasi kuitansi"),
    },
  };
}

export async function getMyW06Billing(signal?: AbortSignal, requester: Requester = apiClient) {
  return parseMyW06Billing(asEnvelope(await requester.get<unknown>("/my/billing", { signal })));
}

export async function getMyW06Receipt(
  receiptId: string,
  signal?: AbortSignal,
  requester: Requester = apiClient,
) {
  return parseMyW06Receipt(
    asEnvelope(
      await requester.get<unknown>(`/my/receipts/${encodeURIComponent(receiptId)}`, { signal }),
    ),
  );
}

export async function submitMyW06Proof(
  input: SubmitMyW06Proof,
  idempotencyKey: string,
  requester: Requester = apiClient,
) {
  return parseSubmittedMyW06Proof(
    asEnvelope(await requester.post<unknown>("/my/payment-proofs", input, { idempotencyKey })),
  );
}

export async function downloadMyInvoiceDocument(invoiceId: string, invoiceCode: string) {
  const filename = `${invoiceCode.replace(/[^a-z0-9_-]+/gi, "-") || "invoice"}.pdf`;
  await fetchPreviewAndDownload(async () => {
    const token = getAccessToken();
    const response = await fetch(
      `${env.VITE_API_BASE_URL}/my/billing/invoices/${encodeURIComponent(invoiceId)}/document`,
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

async function downloadMyPdf(path: string, code: string, fallback: string) {
  const filename = `${code.replace(/[^a-z0-9_-]+/gi, "-") || fallback}.pdf`;
  await fetchPreviewAndDownload(async () => {
    const token = getAccessToken();
    const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "application/pdf")
      throw new Error(`Dokumen PDF gagal diunduh (HTTP ${response.status}).`);
    return response;
  }, filename);
}

export function downloadMyReceiptDocument(receiptId: string, receiptCode: string) {
  return downloadMyPdf(
    `/my/receipts/${encodeURIComponent(receiptId)}/document`,
    receiptCode,
    "kuitansi",
  );
}

export function downloadMyLeaseExitDocument(documentId: string, documentCode: string) {
  return downloadMyPdf(
    `/my/lease-exit-documents/${encodeURIComponent(documentId)}/document`,
    documentCode,
    "dokumen-checkout",
  );
}

export async function downloadMyBillingEvidence(leaseId: string, evidence: MyBillingEvidence) {
  const path = `/my/billing/${uuid(leaseId, "ID kontrak")}/evidence/${uuid(evidence.id, "ID bukti")}/content`;
  if (evidence.availability !== "available" || evidence.content_path !== path)
    throw new Error("Berkas bukti tidak tersedia. Riwayat pembayaran tetap dapat dibaca.");
  const extension = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[evidence.mime_type];
  await fetchPreviewAndDownload(
    async () => {
      const token = getAccessToken();
      const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        if (response.status === 503)
          throw new Error(
            "Penyimpanan belum dapat diakses. Coba unduh kembali beberapa saat lagi; berkas belum dinyatakan hilang.",
          );
        if ([404, 409].includes(response.status))
          throw new Error(
            "Berkas bukti tidak lagi tersedia. Perbarui riwayat pembayaran; catatan transaksi tetap tersimpan.",
          );
        throw new Error(
          "Bukti pembayaran belum dapat diunduh. Coba kembali atau hubungi Pihak Pengelola.",
        );
      }
      if (response.headers.get("content-type")?.split(";")[0] !== evidence.mime_type)
        throw new Error("Jenis berkas bukti belum dapat dipastikan. Hubungi Pihak Pengelola.");
      return response;
    },
    `Bukti-Pembayaran-${new Date().toISOString().slice(0, 10)}.${extension}`,
  );
}
