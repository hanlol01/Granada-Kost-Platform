import { apiClient, getAccessToken } from "@/lib/api";
import { env } from "@/lib/env";

export const W06_INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export const W06_PAYMENT_PURPOSES = ["rent", "dp", "security_deposit", "other_charge"] as const;
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

export type MyW06Billing = {
  lease: {
    id: string;
    property_id: string;
    status: "awaiting_activation" | "active";
    start_date: string;
    end_date: string;
    payment_plan: "annual_full" | "two_month_installments";
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
    allocations: Array<{ invoice_id: string; amount: number }>;
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
  }>;
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

function payment(value: unknown): MyW06Billing["payments"][number] {
  const item = object(
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
    allocations: list(item.allocations, allocation, "Alokasi pembayaran"),
  };
}

export function parseMyW06Billing(value: unknown): MyW06Billing {
  const envelope = object(value, ["data"], "Respons billing");
  const data = object(
    envelope.data,
    ["lease", "summary", "invoices", "payments", "proofs"],
    "Data billing",
  );
  const lease = object(
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
      "remaining_days",
      "note",
    ],
    "Kontrak billing",
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
    "Ringkasan billing",
  );
  return {
    lease: {
      id: uuid(lease.id, "ID kontrak"),
      property_id: uuid(lease.property_id, "ID properti"),
      status: oneOf(lease.status, ["awaiting_activation", "active"] as const, "Status kontrak"),
      start_date: date(lease.start_date, "Mulai kontrak"),
      end_date: date(lease.end_date, "Akhir kontrak"),
      payment_plan: oneOf(
        lease.payment_plan,
        ["annual_full", "two_month_installments"] as const,
        "Paket pembayaran",
      ),
      contract_rent: integer(lease.contract_rent, "Nilai kontrak"),
      monthly_rate: integer(lease.monthly_rate, "Tarif bulanan"),
      remaining_days: integer(lease.remaining_days, "Sisa hari"),
      note: text(lease.note, "Catatan kontrak"),
    },
    summary: {
      rent_invoiced: integer(summary.rent_invoiced, "Total sewa"),
      rent_paid: integer(summary.rent_paid, "Sewa dibayar"),
      rent_outstanding: integer(summary.rent_outstanding, "Sisa sewa"),
      security_deposit_required: integer(summary.security_deposit_required, "Deposit wajib"),
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
    payments: list(data.payments, payment, "Daftar pembayaran"),
    proofs: list(
      data.proofs,
      (value) => {
        const proof = object(
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
        };
      },
      "Daftar bukti",
    ),
  };
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
  return parseMyW06Billing(await requester.get<unknown>("/my/billing", { signal }));
}

export async function getMyW06Receipt(
  receiptId: string,
  signal?: AbortSignal,
  requester: Requester = apiClient,
) {
  return parseMyW06Receipt(
    await requester.get<unknown>(`/my/receipts/${encodeURIComponent(receiptId)}`, { signal }),
  );
}

export async function submitMyW06Proof(
  input: SubmitMyW06Proof,
  idempotencyKey: string,
  requester: Requester = apiClient,
) {
  return parseSubmittedMyW06Proof(
    await requester.post<unknown>("/my/payment-proofs", input, { idempotencyKey }),
  );
}

export async function downloadMyInvoiceDocument(invoiceId: string, invoiceCode: string) {
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

  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${invoiceCode.replace(/[^a-z0-9_-]+/gi, "-") || "invoice"}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
