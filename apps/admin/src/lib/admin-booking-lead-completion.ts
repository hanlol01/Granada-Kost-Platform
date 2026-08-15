import { ApiError } from "@granada-kost/domain";
import { getAccessToken } from "@/lib/api";
import { adminUxV2Requester } from "./admin-ux-api";
import { env } from "./env";

export type LeadInitialPaymentType = "booking_fee" | "down_payment" | "full_settlement";
export type LeadPaymentCommitment = {
  id: string;
  propertyId: string;
  bookingLeadId: string;
  holdId: string;
  roomId: string;
  paymentType: LeadInitialPaymentType;
  rentCreditAmount: number;
  securityDepositAmount: number;
  paymentMethod: "cash" | "bank_transfer";
  verificationStatus: "verified" | "pending_confirmation";
  paymentNote: string | null;
  paymentEvidenceFileIds: string[];
  startDate: string;
  termMonths: number;
  endDate: string;
  billingCycle: "monthly" | "yearly";
  paymentPlanType: "monthly_installments" | "two_month_installments" | "annual_full";
  materializedOnboardingCommitmentId: string | null;
};
export type BookingLeadRentalContext = {
  lead: {
    id: string;
    visitorName: string;
    visitorPhone: string;
    visitorEmail: string | null;
    visitorUniversity: string | null;
    category: "rukost" | "apartkost";
    gender: "male" | "female";
  };
  hold: { id: string; roomId: string; expiresAt: string };
  room: {
    id: string;
    kostTypeId: string;
    number: string;
    category: "rukost" | "apartkost";
    genderPolicy: string;
    monthlyPrice: number;
    yearlyPrice: number;
  };
  paymentCommitment: LeadPaymentCommitment;
};
export type BookingLeadCompletionQuote = {
  propertyId: string;
  startDate: string;
  termMonths: number;
  billingCycle: "monthly" | "yearly";
  endDate: string;
  contractRentAmount: number;
  suggestedDpAmount: number;
  lead: {
    id: string;
    category: "rukost" | "apartkost";
    gender: "male" | "female";
  };
  hold: { id: string; roomId: string; expiresAt: string };
  room: BookingLeadRentalContext["room"];
};
export type CompleteBookingLeadInput = {
  propertyId: string;
  startDate: string;
  termMonths: number;
  billingCycle: "monthly" | "yearly";
  paymentPlanType: "monthly_installments" | "two_month_installments" | "annual_full";
  paymentType: LeadInitialPaymentType;
  rentCreditAmount: number;
  securityDepositAmount: number;
  paymentMethod: "cash" | "bank_transfer";
  paymentEvidenceFileIds?: string[];
  paymentNote?: string;
  visitorName?: string;
  visitorPhone?: string;
  visitorUniversity?: string;
};

export type CancelBookingLeadPaymentCommitmentInput = {
  propertyId: string;
  refundMethod: "cash" | "bank_transfer";
  refundNote?: string;
  refundEvidenceFileIds?: string[];
};

export type BookingLeadPaymentCommitmentRefund = {
  refundId: string;
  commitmentId: string;
  refundAmount: number;
  refundMethod: "cash" | "bank_transfer";
  refundedAt: string;
};

async function openAndDownloadBookingLeadPdf(path: string, filename: string): Promise<void> {
  // Open synchronously so browser popup protection does not block the document preview.
  const previewTab = window.open("about:blank", "_blank");
  if (previewTab) previewTab.opener = null;
  const token = getAccessToken();
  const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/pdf",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    previewTab?.close();
    throw new Error("Dokumen kuitansi belum dapat dimuat. Coba lagi.");
  }
  const url = URL.createObjectURL(await response.blob());
  if (previewTab) previewTab.location.replace(url);
  else window.location.assign(url);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBookingLeadCommitmentNote(input: {
  propertyId: string;
  leadId: string;
}): Promise<void> {
  return openAndDownloadBookingLeadPdf(
    `/booking-leads/${encodeURIComponent(input.leadId)}/payment-commitment-receipt/document?property_id=${encodeURIComponent(input.propertyId)}`,
    "kuitansi-pembayaran-awal.pdf",
  );
}

export function downloadBookingLeadCancellationReceipt(input: {
  propertyId: string;
  leadId: string;
}): Promise<void> {
  return openAndDownloadBookingLeadPdf(
    `/booking-leads/${encodeURIComponent(input.leadId)}/cancellation-receipt/document?property_id=${encodeURIComponent(input.propertyId)}`,
    "kuitansi-refund-minat-booking.pdf",
  );
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Respons penyelesaian minat booking tidak valid");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new Error("Respons penyelesaian minat booking tidak valid");
  return value;
}
function id(value: unknown): string {
  const result = text(value);
  if (!UUID.test(result)) throw new Error("Respons penyelesaian minat booking tidak valid");
  return result;
}
function money(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Respons penyelesaian minat booking tidak valid");
  return value;
}
function date(value: unknown): string {
  const valueText = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueText);
  if (!match) throw new Error("Respons penyelesaian minat booking tidak valid");
  const calendar = new Date(`${valueText}T00:00:00.000Z`);
  if (
    Number.isNaN(calendar.getTime()) ||
    calendar.getUTCFullYear() !== Number(match[1]) ||
    calendar.getUTCMonth() + 1 !== Number(match[2]) ||
    calendar.getUTCDate() !== Number(match[3])
  )
    throw new Error("Respons penyelesaian minat booking tidak valid");
  return valueText;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  const result = text(value);
  if (!options.includes(result as T))
    throw new Error("Respons penyelesaian minat booking tidak valid");
  return result as T;
}
function commitment(value: unknown): LeadPaymentCommitment {
  const row = object(value);
  return {
    id: id(row.id),
    propertyId: id(row.property_id),
    bookingLeadId: id(row.booking_lead_id),
    holdId: id(row.hold_id),
    roomId: id(row.room_id),
    paymentType: oneOf(row.payment_type, [
      "booking_fee",
      "down_payment",
      "full_settlement",
    ] as const),
    rentCreditAmount: money(row.rent_credit_amount),
    securityDepositAmount: money(row.security_deposit_amount),
    paymentMethod: oneOf(row.payment_method, ["cash", "bank_transfer"] as const),
    verificationStatus: oneOf(row.verification_status, [
      "verified",
      "pending_confirmation",
    ] as const),
    paymentNote: row.payment_note === null ? null : text(row.payment_note),
    paymentEvidenceFileIds: Array.isArray(row.payment_evidence_file_ids)
      ? row.payment_evidence_file_ids.map(id)
      : [],
    startDate: date(row.start_date),
    termMonths: money(row.term_months),
    endDate: date(row.end_date),
    billingCycle: oneOf(row.billing_cycle, ["monthly", "yearly"] as const),
    paymentPlanType: oneOf(row.payment_plan_type, [
      "monthly_installments",
      "two_month_installments",
      "annual_full",
    ] as const),
    materializedOnboardingCommitmentId:
      row.materialized_onboarding_commitment_id === null
        ? null
        : id(row.materialized_onboarding_commitment_id),
  };
}

/**
 * A booking lead is intentionally single-use. If a stale `/tenants` link is
 * opened after its payment commitment has been materialized, the API exposes
 * only the property-scoped resident target needed to continue the workflow.
 */
export function completedBookingLeadResidentId(error: unknown): string | null {
  if (!ApiError.isApiError(error) || error.code !== "BOOKING_LEAD_ALREADY_ONBOARDED") {
    return null;
  }
  try {
    return id(object(error.details).resident_id);
  } catch {
    return null;
  }
}
export function parseBookingLeadRentalContext(
  value: unknown,
  propertyId: string,
): BookingLeadRentalContext {
  const envelope = object(value);
  const data = object(envelope.data);
  const lead = object(data.lead);
  const hold = object(data.hold);
  const room = object(data.room);
  const parsed = commitment(data.payment_commitment);
  if (
    parsed.propertyId !== propertyId ||
    parsed.bookingLeadId !== id(lead.id) ||
    parsed.holdId !== id(hold.id) ||
    parsed.roomId !== id(room.id)
  )
    throw new Error("Respons penyelesaian minat booking tidak konsisten");
  const category = oneOf(lead.category, ["rukost", "apartkost"] as const);
  const gender = oneOf(lead.gender, ["male", "female"] as const);
  const roomCategory = oneOf(room.category, ["rukost", "apartkost"] as const);
  const genderPolicy = oneOf(room.gender_policy, ["male", "female", "mixed"] as const);
  if (category !== roomCategory || (genderPolicy !== "mixed" && genderPolicy !== gender))
    throw new Error("Respons penyelesaian minat booking tidak konsisten");
  return {
    lead: {
      id: id(lead.id),
      visitorName: text(lead.visitor_name),
      visitorPhone: text(lead.visitor_phone),
      visitorEmail: lead.visitor_email === null ? null : text(lead.visitor_email),
      visitorUniversity: lead.visitor_university === null ? null : text(lead.visitor_university),
      category,
      gender,
    },
    hold: { id: id(hold.id), roomId: id(hold.room_id), expiresAt: text(hold.expires_at) },
    room: {
      id: id(room.id),
      kostTypeId: id(room.kost_type_id),
      number: text(room.number),
      category: roomCategory,
      genderPolicy,
      monthlyPrice: money(room.monthly_price),
      yearlyPrice: money(room.yearly_price),
    },
    paymentCommitment: parsed,
  };
}
export function parseBookingLeadCompletionQuote(
  value: unknown,
  propertyId: string,
  startDate: string,
  termMonths: number,
): BookingLeadCompletionQuote {
  const envelope = object(value);
  const data = object(envelope.data);
  const lead = object(data.lead);
  const hold = object(data.hold);
  const room = object(data.room);
  const leadId = id(lead.id);
  const holdId = id(hold.id);
  const roomId = id(room.id);
  const responsePropertyId = id(data.property_id);
  if (
    responsePropertyId !== propertyId ||
    id(hold.room_id) !== roomId ||
    date(data.start_date) !== startDate ||
    money(data.term_months) !== termMonths
  ) {
    throw new Error("Respons quote minat booking tidak konsisten");
  }
  const category = oneOf(lead.category, ["rukost", "apartkost"] as const);
  const gender = oneOf(lead.gender, ["male", "female"] as const);
  const roomCategory = oneOf(room.category, ["rukost", "apartkost"] as const);
  const genderPolicy = oneOf(room.gender_policy, ["male", "female", "mixed"] as const);
  if (category !== roomCategory || (genderPolicy !== "mixed" && genderPolicy !== gender)) {
    throw new Error("Respons quote minat booking tidak konsisten");
  }
  return {
    propertyId: responsePropertyId,
    startDate,
    termMonths,
    billingCycle: oneOf(data.billing_cycle, ["monthly", "yearly"] as const),
    endDate: date(data.end_date),
    contractRentAmount: money(data.contract_rent_amount),
    suggestedDpAmount: money(data.suggested_dp_amount),
    lead: { id: leadId, category, gender },
    hold: { id: holdId, roomId, expiresAt: text(hold.expires_at) },
    room: {
      id: roomId,
      kostTypeId: id(room.kost_type_id),
      number: text(room.number),
      category: roomCategory,
      genderPolicy,
      monthlyPrice: money(room.monthly_price),
      yearlyPrice: money(room.yearly_price),
    },
  };
}
export async function requestCompleteBookingLead(
  leadId: string,
  input: CompleteBookingLeadInput,
  idempotencyKey: string,
) {
  const response = await adminUxV2Requester.post<unknown>(
    `/booking-leads/${encodeURIComponent(leadId)}/complete`,
    {
      property_id: input.propertyId,
      start_date: input.startDate,
      term_months: input.termMonths,
      billing_cycle: input.billingCycle,
      payment_plan_type: input.paymentPlanType,
      payment_type: input.paymentType,
      rent_credit_amount: input.rentCreditAmount,
      security_deposit_amount: input.securityDepositAmount,
      payment_method: input.paymentMethod,
      payment_evidence_file_ids: input.paymentEvidenceFileIds,
      payment_note: input.paymentNote?.trim() || undefined,
      visitor_name: input.visitorName?.trim() || undefined,
      visitor_phone: input.visitorPhone?.trim() || undefined,
      visitor_university: input.visitorUniversity?.trim() || undefined,
    },
    { idempotencyKey },
  );
  return commitment(object(response).data);
}

function parseBookingLeadPaymentCommitmentRefund(
  value: unknown,
): BookingLeadPaymentCommitmentRefund {
  const row = object(object(value).data);
  return {
    refundId: id(row.refund_id),
    commitmentId: id(row.commitment_id),
    refundAmount: money(row.refund_amount),
    refundMethod: oneOf(row.refund_method, ["cash", "bank_transfer"] as const),
    refundedAt: text(row.refunded_at),
  };
}

export async function requestCancelBookingLeadPaymentCommitment(
  leadId: string,
  input: CancelBookingLeadPaymentCommitmentInput,
  idempotencyKey: string,
): Promise<BookingLeadPaymentCommitmentRefund> {
  return parseBookingLeadPaymentCommitmentRefund(
    await adminUxV2Requester.post<unknown>(
      `/booking-leads/${encodeURIComponent(leadId)}/cancel-payment-commitment`,
      {
        property_id: input.propertyId,
        refund_method: input.refundMethod,
        refund_note: input.refundNote?.trim() || undefined,
        refund_evidence_file_ids: input.refundEvidenceFileIds,
      },
      { idempotencyKey },
    ),
  );
}
export async function requestBookingLeadRentalContext(leadId: string, propertyId: string) {
  return parseBookingLeadRentalContext(
    await adminUxV2Requester.get<unknown>(
      `/booking-leads/${encodeURIComponent(leadId)}/rental-context`,
      { query: { property_id: propertyId } },
    ),
    propertyId,
  );
}

export async function requestBookingLeadCompletionQuote(
  leadId: string,
  propertyId: string,
  startDate: string,
  termMonths: number,
) {
  return parseBookingLeadCompletionQuote(
    await adminUxV2Requester.get<unknown>(
      `/booking-leads/${encodeURIComponent(leadId)}/completion-quote`,
      { query: { property_id: propertyId, start_date: startDate, term_months: termMonths } },
    ),
    propertyId,
    startDate,
    termMonths,
  );
}
